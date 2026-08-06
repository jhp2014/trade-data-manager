// SkeletonShapes — 손으로 찍은 골격의 **해소된 피벗 좌표**를 전 타점분 한 번에 내는 읽기모델(app 읽기측).
//
// 계산 축(ComputedAxes)과 재료가 같고 결과가 다르다: 축은 형태에서 **수치 하나**를 고르고(skeletonShape),
// 여기는 **좌표 그대로**를 낸다. 형태층을 안 거치므로 축이 늘거나 계산식이 바뀌어도 이 파일은 안 흔들린다.
//
// **파일 캐시를 두지 않는다.** 축에서 캐시가 값어치를 하는 건 타점별 지문 무효화(앵커 편집 → 그 타점만 재계산)
// 가 있기 때문인데, 여기 소비자는 화면 하나뿐이고 클라가 react-query 로 들고 있는다. 캐시를 붙이면 골격을
// 하나 찍을 때마다 무효화 규칙을 또 하나 유지해야 하고, 그 규칙이 틀리면 **화면이 옛 그림을 보여준다** —
// 굽는 비용(차트당 일봉 창 1회)보다 그 위험이 크다. 느려지면 그때 축과 같은 지문 방식으로 붙인다.
import type { AxisDeps, ReviewPointReader, PricedPivot, BaselineLevel } from "@trade-data-manager/market";
import { resolveBaselineLevels, resolveDailySkeletons, resolveMinuteSkeletons } from "@trade-data-manager/market";
import type { SkeletonFeed, SkeletonWireEntry, SkeletonWireLevels } from "@trade-data-manager/wire";

export interface SkeletonShapesDeps {
    /** 모집단 = 전 복기 타점. 일봉 골격은 차트 소유라 여기서 차트 집합이 나온다. */
    points: ReviewPointReader;
    axisDeps: AxisDeps;
}

/**
 * 해소 결과 맵 → 와이어 항목. 키는 리졸버가 만든 것을 되판다:
 *   일봉 = `종목|날짜`(차트 소유) · 분봉 = `종목|날짜|시각`(타점 소유).
 * **null(재료 부족) 은 뺀다** — 키 없음(미입력)과 함께 "그릴 게 없다"로 합류한다(그림에는 구분이 없다).
 */
function toEntries(resolved: Map<string, PricedPivot[] | null>): SkeletonWireEntry[] {
    const out: SkeletonWireEntry[] = [];
    for (const [key, pivots] of resolved) {
        if (!pivots) continue;
        const [stockCode, date, time] = key.split("|");
        out.push({
            stockCode,
            date,
            ...(time ? { time } : {}),
            pivots: pivots.map((p) => ({ t: p.tIndex, price: p.price })),
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
        const points = await this.deps.points.listAllPoints();
        if (points.length === 0) return { daily: [], minute: [], levels: [] };
        const anchors = await this.deps.axisDeps.chartAnchor.listAll();
        // 셋 다 재료가 갈린다(일봉 창 / 당일 분봉 / 앵커 캔들 하루치) — 서로 기다릴 이유가 없어 나란히.
        const [daily, minute, levels] = await Promise.all([
            resolveDailySkeletons(points, anchors, this.deps.axisDeps),
            resolveMinuteSkeletons(points, anchors, this.deps.axisDeps),
            resolveBaselineLevels(points, anchors, this.deps.axisDeps),
        ]);
        return { daily: toEntries(daily), minute: toEntries(minute), levels: toLevels(levels) };
    }
}
