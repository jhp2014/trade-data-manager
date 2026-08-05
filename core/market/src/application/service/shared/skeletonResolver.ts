// 골격 해소 — 골격 앵커 행들을 **가격까지 붙은 정렬된 피벗**으로 만든다. 일봉·분봉 두 벌.
//
// 3층 중 가운데. 아래(저장 모델)가 바뀌면 여기만 고치고, 위(형태·축)는 안 흔들린다:
//   앵커 행 → [이 파일] → PricedPivot[] → skeletonShape(순수) → 축이 값 하나를 고름
//
// **두 해상도가 여기서만 갈린다.** 형태층·축 팩토리는 무슨 해상도인지 모른다 — 그래서 분봉 골격을 얹는 데
// 형태 계산은 한 줄도 안 바뀌었다(단위만 tIndex 주석이 말한다).
//   · 일봉(차트 소유): 차트 창(chartDailyRange 2년) 1회 읽기 · tIndex = 창 안 **거래일 인덱스**
//   · 분봉(타점 소유): 그 날 분봉 1회 읽기 · tIndex = **벽시계 분**(장중은 연속이라 갭 없음)
//
// **하나라도 못 읽으면 그 골격은 통째로 결손**이다. 못 읽은 피벗만 빼고 계산하면 형태가 조용히 달라진다
// (되돌림의 골이 사라지는 식) — 없는 걸 뺀 모양은 사람이 찍은 그 모양이 아니다.
import { candlePrice, chartKeyOf, pointKeyOf, SKELETON_MINUTE_PARAM, SKELETON_PARAM, sortPivots, type ChartAnchor, type DailyCandle, type MinuteCandle, type PricedPivot, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "./dailyRange.js";
import type { AxisDeps } from "../axis/axis.js";

/** (종목,날) 동시 읽기 상한 — 축들과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

/** 벽시계 분 — "HH:MM:SS" → 분. 형태 계산은 차이만 쓰므로 원점(자정)은 무관하다. */
const minutesOf = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

/**
 * 타점들이 속한 차트의 **일봉** 골격을 일괄 해소한다.
 * 반환 맵: 차트키 → 정렬된 가격 피벗. **키 없음 = 골격 미입력** / **null = 재료 부족(결손)**.
 * 소비 축은 non-null 만 잡으면 두 경우가 자연히 빠진다(입력 전 ≠ 결손, 결손 분모는 ComputedAxes 가 가른다).
 */
export async function resolveDailySkeletons(
    points: readonly ReviewPointKey[],
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "adjDaily" | "minute">,
): Promise<Map<string, PricedPivot[] | null>> {
    const charts = new Set(points.map(chartKeyOf));
    const byChart = new Map<string, ChartAnchor[]>();
    for (const a of anchors) {
        if (a.param !== SKELETON_PARAM || a.time != null) continue; // 차트 소유만(타점 소유는 예약 — 병합 규칙 미정)
        if (a.field == null) continue; // 가격 피벗만(시각 앵커는 골격 점이 될 수 없다 — 서버 검증, 방어적으로)
        const key = chartKeyOf(a);
        if (!charts.has(key)) continue;
        const list = byChart.get(key);
        if (list) list.push(a);
        else byChart.set(key, [a]);
    }
    if (byChart.size === 0) return new Map();

    // 일봉 창 — 차트당 1회. 상한이 차트 날짜라 축 규칙 2가 질의로 지켜진다(피벗은 그 이전만 — 도메인이 강제).
    const dailyByChart = new Map<string, DailyCandle[]>();
    await mapWithConcurrency([...byChart.keys()], DAY_CONCURRENCY, async (key) => {
        const [stockCode, date] = key.split("|");
        dailyByChart.set(key, await deps.adjDaily.getDailyCandles(stockCode, { from: chartDailyRange(date).from, to: date }));
    });

    // 분봉 — 분봉 골격을 쓴 차트만(드묾). 한 골격은 해상도가 통일돼 있어 섞여 들어오지 않는다.
    const minuteKeys = new Map<string, { stockCode: string; date: string }>();
    for (const list of byChart.values()) {
        for (const a of list) if (a.anchorTime) minuteKeys.set(`${a.stockCode}|${a.anchorDate}`, { stockCode: a.stockCode, date: a.anchorDate });
    }
    const minutesByDay = new Map<string, MinuteCandle[]>();
    await mapWithConcurrency([...minuteKeys.values()], DAY_CONCURRENCY, async (d) => {
        minutesByDay.set(`${d.stockCode}|${d.date}`, await deps.minute.getMinuteCandles(d.stockCode, d.date));
    });

    const out = new Map<string, PricedPivot[] | null>();
    for (const [key, list] of byChart) {
        const stockCode = list[0].stockCode;
        const daily = dailyByChart.get(key) ?? [];
        // 거래일 인덱스 — 창 안 일봉의 순번. 분봉 피벗도 그 날의 일봉 순번을 쓴다(같은 날이면 같은 인덱스).
        const dayIndexOf = new Map(daily.map((c, i) => [c.date, i] as const));
        const dailyByDate = new Map(daily.map((c) => [c.date, c] as const));
        const pivots = sortPivots(list.map((x) => ({ anchorDate: x.anchorDate, anchorTime: x.anchorTime, field: x.field!, market: x.market! })));
        const priced: PricedPivot[] = [];
        let broken = false;
        for (const p of pivots) {
            const dayIndex = dayIndexOf.get(p.anchorDate);
            // 시장은 값을 꺼내는 경로 — 사람이 지목한 그 시장에서 읽는다(오염 캔들 회피 판단이 여기 산다).
            const raw = p.anchorTime
                ? minutesByDay.get(`${stockCode}|${p.anchorDate}`)?.find((c) => c.time === p.anchorTime)?.[p.market]?.[p.field]
                : dailyByDate.get(p.anchorDate)?.[p.market]?.[p.field];
            const price = candlePrice(raw);
            if (dayIndex === undefined || price === null) { broken = true; break; } // 창 밖·미수집
            priced.push({ ...p, price, tIndex: dayIndex });
        }
        out.set(key, broken || priced.length < 2 ? null : priced);
    }
    return out;
}

/**
 * 타점들의 **분봉** 골격을 일괄 해소한다(타점 소유·당일).
 * 반환 맵: 타점키 → 정렬된 가격 피벗. **키 없음 = 미입력** / **null = 재료 부족(결손)**.
 *
 * 일봉판과 갈리는 지점 셋:
 *   · 그룹 키가 차트가 아니라 **타점**(같은 차트의 두 타점이 서로 다른 골격을 갖는 게 존재 이유)
 *   · 읽기가 (종목, 그 날) 분봉 1회 — 당일 고정이라 창 개념이 없다
 *   · tIndex 가 벽시계 분(장중은 연속이라 봉 개수가 아니라 시간이 맞다 — 유동성 낮은 종목 왜곡 방지)
 * 시장은 언제나 UN — 분봉 앵커의 market 은 'un' 고정이다(KRX 분봉은 세션 부재가 있어 앵커로 못 쓴다).
 */
export async function resolveMinuteSkeletons(
    points: readonly ReviewPointKey[],
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "minute">,
): Promise<Map<string, PricedPivot[] | null>> {
    const live = new Set(points.map(pointKeyOf));
    const byPoint = new Map<string, ChartAnchor[]>();
    for (const a of anchors) {
        if (a.param !== SKELETON_MINUTE_PARAM || a.time == null) continue; // 타점 소유만
        if (a.field == null || a.anchorTime == null) continue; // 가격·분봉 피벗만(서버 검증, 방어적으로)
        const key = `${a.stockCode}|${a.date}|${a.time}`;
        if (!live.has(key)) continue;
        const list = byPoint.get(key);
        if (list) list.push(a);
        else byPoint.set(key, [a]);
    }
    if (byPoint.size === 0) return new Map();

    // 분봉 — (종목, 날) 당 1회. 같은 날 여러 타점이 골격을 가져도 읽기는 한 번.
    const dayKeys = new Map<string, { stockCode: string; date: string }>();
    for (const list of byPoint.values()) dayKeys.set(`${list[0].stockCode}|${list[0].date}`, { stockCode: list[0].stockCode, date: list[0].date });
    const minutesByDay = new Map<string, MinuteCandle[]>();
    await mapWithConcurrency([...dayKeys.values()], DAY_CONCURRENCY, async (d) => {
        minutesByDay.set(`${d.stockCode}|${d.date}`, await deps.minute.getMinuteCandles(d.stockCode, d.date));
    });

    const out = new Map<string, PricedPivot[] | null>();
    for (const [key, list] of byPoint) {
        const bars = minutesByDay.get(`${list[0].stockCode}|${list[0].date}`) ?? [];
        const barByTime = new Map(bars.map((b) => [b.time, b] as const));
        const pivots = sortPivots(list.map((x) => ({ anchorDate: x.anchorDate, anchorTime: x.anchorTime!, field: x.field!, market: x.market! })));
        const priced: PricedPivot[] = [];
        let broken = false;
        for (const p of pivots) {
            const price = candlePrice(barByTime.get(p.anchorTime!)?.un?.[p.field]);
            if (price === null) { broken = true; break; } // 그 분봉 미수집
            priced.push({ ...p, price, tIndex: minutesOf(p.anchorTime!) });
        }
        out.set(key, broken || priced.length < 2 ? null : priced);
    }
    return out;
}
