// SkeletonShapes — 손으로 찍은 골격의 **해소된 피벗 좌표**를 한 번에 내는 읽기모델(app 읽기측).
//
// 계산 축(ComputedAxes)과 재료가 같고 결과가 다르다: 축은 형태에서 **수치 하나**를 고르고(skeletonShape),
// 여기는 **좌표 그대로**를 낸다. 형태층을 안 거치므로 축이 늘거나 계산식이 바뀌어도 이 파일은 안 흔들린다.
//
// **모집단은 차트다**(일봉·분봉 골격 둘 다 차트 소유) — 골격이 그려져 있으면 타점이 0개여도 나온다.
// 분봉은 **하루 경로 전체**를 낸다(타점 절단 없음): 이 피드는 형태 비교용이고, 타점 문맥의 절단은
// 축(resolveMinuteSkeletons)의 몫이다. 화면은 오히려 타점 이후까지 보여 "어디까지 갔나"를 읽는다.
//
// **파일 캐시를 두지 않는다.** 축에서 캐시가 값어치를 하는 건 타점별 지문 무효화(앵커 편집 → 그 타점만 재계산)
// 가 있기 때문인데, 여기 소비자는 화면 하나뿐이고 클라가 react-query 로 들고 있는다. 캐시를 붙이면 골격을
// 하나 찍을 때마다 무효화 규칙을 또 하나 유지해야 하고, 그 규칙이 틀리면 **화면이 옛 그림을 보여준다** —
// 굽는 비용(차트당 일봉 창 1회)보다 그 위험이 크다. 느려지면 그때 축과 같은 지문 방식으로 붙인다.
import type { AxisDeps, ReviewPointReader, PricedPivot, BaselineLevel } from "@trade-data-manager/market";
import {
    candlePrice,
    mapWithConcurrency,
    minuteSkeletonChartKeys,
    resolveBaselineLevelsForCharts,
    resolveDailySkeletonsForCharts,
    resolveMinuteSkeletonsForCharts,
    skeletonChartKeys,
} from "@trade-data-manager/market";
import type { SkeletonFeed, SkeletonWireEntry, SkeletonWireLevels } from "@trade-data-manager/wire";

/** (종목,날) 동시 읽기 상한 — 리졸버들과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

/** 전일 종가 조회 창 — 직전 거래일이 명절 연휴 너머에 있어도 잡히는 여유(달력일). */
const PREV_CLOSE_WINDOW_DAYS = 14;

const isoMinusDays = (date: string, days: number): string => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};

/**
 * 해소 결과 맵 → 와이어 항목. 키는 리졸버가 만든 차트키(`종목|날짜`)를 되판다.
 * **null(재료 부족) 은 뺀다** — 키 없음(미입력)과 함께 "그릴 게 없다"로 합류한다(그림에는 구분이 없다).
 */
function toEntries(resolved: Map<string, PricedPivot[] | null>, prevCloseOf?: Map<string, number>): SkeletonWireEntry[] {
    const out: SkeletonWireEntry[] = [];
    for (const [key, pivots] of resolved) {
        if (!pivots) continue;
        const [stockCode, date] = key.split("|");
        const prevClose = prevCloseOf?.get(key);
        out.push({
            stockCode,
            date,
            pivots: pivots.map((p) => ({ t: p.tIndex, price: p.price })),
            ...(prevClose != null ? { prevClose } : {}),
        });
    }
    return out;
}

/** 선 목록 맵 → 와이어 항목. 키는 언제나 차트키(`종목|날짜`) — 선은 차트 소유다. */
function toLevels(resolved: Map<string, BaselineLevel[]>): SkeletonWireLevels[] {
    const out: SkeletonWireLevels[] = [];
    for (const [key, levels] of resolved) {
        const [stockCode, date] = key.split("|");
        out.push({ stockCode, date, levels });
    }
    return out;
}

export interface SkeletonShapesDeps {
    /** 전 복기 타점 — 골격 모집단이 아니라 **선(levels) 범위의 절반**(타점만 있는 차트도 선을 갖는다). */
    points: ReviewPointReader;
    axisDeps: AxisDeps;
}

export class SkeletonShapes {
    /** 동시 요청 공유 — 패널을 여러 개 열어도 굽기는 한 번(ComputedAxes.inFlight 와 같은 이유). */
    private inFlight: Promise<SkeletonFeed> | null = null;

    constructor(private readonly deps: SkeletonShapesDeps) {}

    feed(): Promise<SkeletonFeed> {
        if (this.inFlight) return this.inFlight;
        const p = this.build().finally(() => { this.inFlight = null; });
        this.inFlight = p;
        return p;
    }

    private async build(): Promise<SkeletonFeed> {
        const anchors = await this.deps.axisDeps.chartAnchor.listAll();
        const dailyCharts = skeletonChartKeys(anchors);
        const minuteCharts = minuteSkeletonChartKeys(anchors);
        const points = await this.deps.points.listAllPoints();
        if (dailyCharts.size === 0 && minuteCharts.size === 0 && points.length === 0) return { daily: [], minute: [], levels: [] };
        // 넷 다 재료가 갈린다(일봉 창 / 당일 분봉 / 전일 종가 / 앵커 캔들 하루치) — 서로 기다릴 이유가 없어 나란히.
        // 선(levels)의 범위는 **세 모집단의 합집합** — 어느 골격만 있는 차트도, 타점만 있는 차트도 선을 갖는다.
        const levelCharts = new Set([...dailyCharts, ...minuteCharts, ...points.map((p) => `${p.stockCode}|${p.date}`)]);
        const [daily, minute, prevCloses, levels] = await Promise.all([
            resolveDailySkeletonsForCharts(dailyCharts, anchors, this.deps.axisDeps),
            resolveMinuteSkeletonsForCharts(minuteCharts, anchors, this.deps.axisDeps),
            this.prevCloses(minuteCharts),
            resolveBaselineLevelsForCharts(levelCharts, anchors, this.deps.axisDeps),
        ]);
        return { daily: toEntries(daily), minute: toEntries(minute, prevCloses), levels: toLevels(levels) };
    }

    /** 분봉 골격 차트의 전일 종가(UN 수정주가) — 절대 배치 뷰의 분모. 없는 차트는 키가 없다(지어내지 않는다). */
    private async prevCloses(charts: ReadonlySet<string>): Promise<Map<string, number>> {
        const out = new Map<string, number>();
        await mapWithConcurrency([...charts], DAY_CONCURRENCY, async (key) => {
            const [stockCode, date] = key.split("|");
            const rows = await this.deps.axisDeps.adjDaily.getDailyCandles(stockCode, { from: isoMinusDays(date, PREV_CLOSE_WINDOW_DAYS), to: date });
            // 창의 마지막 행이 당일일 수 있으므로 "date 미만의 마지막"을 찾는다.
            for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i].date >= date) continue;
                const price = candlePrice(rows[i].un?.close);
                if (price !== null) out.set(key, price);
                break;
            }
        });
        return out;
    }
}
