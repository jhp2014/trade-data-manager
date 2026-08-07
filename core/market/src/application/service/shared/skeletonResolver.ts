// 골격 해소 — 골격 앵커 행들을 **가격까지 붙은 정렬된 피벗**으로 만든다. 일봉·분봉 두 벌, 둘 다 차트 소유.
//
// 3층 중 가운데. 아래(저장 모델)가 바뀌면 여기만 고치고, 위(형태·축)는 안 흔들린다:
//   앵커 행 → [이 파일] → PricedPivot[] → skeletonShape(순수) → 축이 값 하나를 고름
//
// **두 해상도가 여기서만 갈린다.** 형태층·축 팩토리는 무슨 해상도인지 모른다 — 그래서 분봉 골격을 얹는 데
// 형태 계산은 한 줄도 안 바뀌었다(단위만 tIndex 주석이 말한다).
//   · 일봉: 차트 창(chartDailyRange 2년) 1회 읽기 · tIndex = 창 안 **거래일 인덱스**
//   · 분봉: 그 날 분봉 1회 읽기 · tIndex = **벽시계 분**(장중은 연속이라 갭 없음)
//     타점 문맥은 **읽기 절단**(resolveMinuteSkeletons)이 만든다 — 절단이 이 파일 밖으로 새면 축 규칙 2 가 깨진다.
//
// **하나라도 못 읽으면 그 골격은 통째로 결손**이다. 못 읽은 피벗만 빼고 계산하면 형태가 조용히 달라진다
// (되돌림의 골이 사라지는 식) — 없는 걸 뺀 모양은 사람이 찍은 그 모양이 아니다.
import { candlePrice, chartKeyOf, pointKeyOf, SKELETON_MINUTE_PARAM, SKELETON_PARAM, sortPivots, type ChartAnchor, type DailyCandle, type MinuteCandle, type PricedPivot, type ReviewPointKey, type SkeletonPivot } from "#domain";
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
    return resolveDailySkeletonsForCharts(new Set(points.map(chartKeyOf)), anchors, deps);
}

/**
 * 일봉 골격이 그려진 차트 전부의 키. **타점과 무관하다** — 일봉 골격은 차트 소유라 타점이 하나도 없는
 * 차트에도 존재할 수 있고, 형태를 비교할 땐 그것들이 오히려 모집단의 대부분이다.
 */
export function skeletonChartKeys(anchors: readonly ChartAnchor[]): Set<string> {
    const out = new Set<string>();
    for (const a of anchors) if (a.param === SKELETON_PARAM && a.time == null && a.field != null) out.add(chartKeyOf(a));
    return out;
}

/**
 * 위와 같되 **범위를 차트 집합으로 직접** 받는다.
 * 타점에서 출발하는 판(축)과 차트에서 출발하는 판(형태 비교 화면)이 같은 계산을 쓰도록 몸통을 여기 둔다 —
 * 두 벌로 두면 한쪽만 고쳐져 같은 골격이 화면과 축에서 다르게 풀리는데, 그건 눈으로 못 잡는 종류의 어긋남이다.
 */
export async function resolveDailySkeletonsForCharts(
    charts: ReadonlySet<string>,
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "adjDaily" | "minute">,
): Promise<Map<string, PricedPivot[] | null>> {
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

/** 분봉 골격이 그려진 차트 전부의 키 — 일봉판(skeletonChartKeys)의 짝. 타점과 무관하다(차트 소유). */
export function minuteSkeletonChartKeys(anchors: readonly ChartAnchor[]): Set<string> {
    const out = new Set<string>();
    for (const a of anchors) {
        if (a.param === SKELETON_MINUTE_PARAM && a.time == null && a.field != null && a.anchorTime != null) out.add(chartKeyOf(a));
    }
    return out;
}

/**
 * 차트들의 **분봉** 골격(그 날 장중 경로 전체)을 일괄 해소한다.
 * 반환 맵: 차트키 → 정렬된 가격 피벗. **키 없음 = 미입력** / **null = 재료 부족(결손)**.
 *
 * **타점 종가 합성**(사용자 확정: "타점 종가 = 골격의 한 점"): pointTimesByChart 로 받은 각 타점 시각의
 * 분봉 **종가**를 합성 피벗으로 병합한다. 규칙:
 *   · 그 캔들에 손 피벗이 하나라도 있으면 합성하지 않는다(직접 찍은 게 이긴다)
 *   · 손 피벗이 0개인 차트는 애초에 골격이 아니다(타점 종가는 골격을 보강하지 창조하지 않는다 — byChart 조건)
 *   · 타점 시각 분봉이 미수집이면 골격 통째 결손(손 피벗과 같은 규칙 — 빼지도 지어내지도 않는다)
 *
 * 일봉판과 갈리는 지점 둘:
 *   · 읽기가 (종목, 그 날) 분봉 1회 — 당일 고정이라 창 개념이 없다
 *   · tIndex 가 벽시계 분(장중은 연속이라 봉 개수가 아니라 시간이 맞다 — 유동성 낮은 종목 왜곡 방지)
 * 시장은 언제나 UN — 분봉 앵커의 market 은 'un' 고정이다(KRX 분봉은 세션 부재가 있어 앵커로 못 쓴다).
 * ⚠ **하루 전체다** — 타점 문맥으로 쓸 값은 반드시 resolveMinuteSkeletons(절단판)를 거칠 것.
 */
export async function resolveMinuteSkeletonsForCharts(
    charts: ReadonlySet<string>,
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "minute">,
    /** 차트키 → 그 차트 타점 시각들(HH:MM:SS). **전 타점이어야 한다** — 부분집합이면 경로가 조회마다 달라진다. */
    pointTimesByChart?: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, PricedPivot[] | null>> {
    const byChart = new Map<string, ChartAnchor[]>();
    for (const a of anchors) {
        if (a.param !== SKELETON_MINUTE_PARAM || a.time != null) continue; // 차트 소유만(옛 타점 소유 잔재 무시)
        if (a.field == null || a.anchorTime == null) continue; // 가격·분봉 피벗만(서버 검증, 방어적으로)
        const key = chartKeyOf(a);
        if (!charts.has(key)) continue;
        const list = byChart.get(key);
        if (list) list.push(a);
        else byChart.set(key, [a]);
    }
    if (byChart.size === 0) return new Map();

    const minutesByDay = new Map<string, MinuteCandle[]>();
    await mapWithConcurrency([...byChart.keys()], DAY_CONCURRENCY, async (key) => {
        const [stockCode, date] = key.split("|");
        minutesByDay.set(key, await deps.minute.getMinuteCandles(stockCode, date));
    });

    const out = new Map<string, PricedPivot[] | null>();
    for (const [key, list] of byChart) {
        const date = list[0].date;
        const bars = minutesByDay.get(key) ?? [];
        const barByTime = new Map(bars.map((b) => [b.time, b] as const));
        const manualTimes = new Set(list.map((a) => a.anchorTime!));
        const pivots: SkeletonPivot[] = list.map((x) => ({ anchorDate: x.anchorDate, anchorTime: x.anchorTime!, field: x.field!, market: x.market! }));
        // 합성 피벗 후보 — 손 피벗이 있는 캔들은 건너뛴다(어떤 값을 찍었든 그 캔들의 뜻은 사람이 정했다).
        const synthTimes = new Set<string>();
        for (const t of pointTimesByChart?.get(key) ?? []) if (!manualTimes.has(t)) synthTimes.add(t);
        for (const t of synthTimes) pivots.push({ anchorDate: date, anchorTime: t, field: "close", market: "un" });

        const priced: PricedPivot[] = [];
        let broken = false;
        for (const p of sortPivots(pivots)) {
            const price = candlePrice(barByTime.get(p.anchorTime!)?.un?.[p.field]);
            if (price === null) { broken = true; break; } // 그 분봉 미수집(합성 대상 포함)
            priced.push({ ...p, price, tIndex: minutesOf(p.anchorTime!), ...(synthTimes.has(p.anchorTime!) ? { synthetic: true } : {}) });
        }
        out.set(key, broken || priced.length < 2 ? null : priced);
    }
    return out;
}

/**
 * 타점들의 분봉 골격 — 차트 경로(합성 포함)를 **그 타점 시각에서 끊은 것**. 축(계산 축)이 보는 판.
 * 반환 맵: 타점키 → 정렬된 가격 피벗. **키 없음 = 미입력**(그 시각까지 피벗이 2개 미만인 것 포함 —
 * "아직 골격이 없던 시각"은 결손이 아니다) / **null = 재료 부족(결손)**.
 *
 * 합성의 형제 결합: 경로에는 **차트의 전 타점** 종가가 들어가므로(요청된 부분집합이 아니라 — 아니면
 * 증분 계산과 전량 계산이 다른 값을 낸다) deps.reviewPoints 에서 전 타점을 직접 읽는다.
 * 자기 종가는 자기 시각 ≤ 시각이라 절단 후에도 남는다 — "직전 추세의 끝 = 결정 순간의 위치".
 *
 * ⚠ **읽기 절단은 여기가 유일하다.** 분봉 골격이 차트 소유가 되면서 축 규칙 2(타점 이후 정보 금지)의
 * 보장이 쓰기에서 여기로 옮겨왔다 — 타점 문맥에서 ForCharts 판을 직접 쓰면 미래 피벗이 조용히 샌다.
 */
export async function resolveMinuteSkeletons(
    points: readonly ReviewPointKey[],
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "minute" | "reviewPoints">,
): Promise<Map<string, PricedPivot[] | null>> {
    const charts = new Set(points.map(chartKeyOf));
    const all = await deps.reviewPoints.listAllPoints();
    const timesByChart = new Map<string, string[]>();
    for (const p of all) {
        const key = chartKeyOf(p);
        if (!charts.has(key)) continue;
        const list = timesByChart.get(key);
        if (list) list.push(p.time);
        else timesByChart.set(key, [p.time]);
    }
    const byChart = await resolveMinuteSkeletonsForCharts(charts, anchors, deps, timesByChart);
    const out = new Map<string, PricedPivot[] | null>();
    for (const p of points) {
        const full = byChart.get(chartKeyOf(p));
        if (full === undefined) continue; // 그 차트에 분봉 골격 미입력
        if (full === null) { out.set(pointKeyOf(p), null); continue; } // 차트 단위 결손은 타점에도 결손
        const cut = full.filter((x) => x.anchorTime != null && x.anchorTime <= p.time);
        if (cut.length < 2) continue; // 그 시각엔 골격이 아직 없다 — 미입력과 같은 취급
        out.set(pointKeyOf(p), cut);
    }
    return out;
}
