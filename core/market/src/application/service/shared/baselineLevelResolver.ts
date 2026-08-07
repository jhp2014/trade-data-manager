// 기준선 레벨 리졸버 — 차트에 그은 선들을 **전부 가격까지 풀어서** 낸다(그림용).
//
// baselineResolver 와 무엇이 다른가: 그쪽은 축이 쓸 **하나**를 고르고 가격은 필요할 때만 읽는다(후보 1개면
// 좌표만으로 확정 — 거리 축의 견고성). 여기는 **다 그려야 하므로 전부 읽는다**. 목적이 달라 읽기 전략이 갈릴
// 뿐, "어느 것이 기준선인가"의 판정은 두 곳 다 도메인 beatsAsBaseline 하나를 부른다(규칙은 여전히 한 곳).
//
// 결손 처리도 목적을 따라간다:
//   · 못 읽은 선은 **그 선만 빠진다** — 그림에서 한 선이 없다고 나머지를 지울 이유가 없다.
//   · 다만 하나라도 못 읽었으면 **어느 것도 기준선으로 표시하지 않는다**. 못 읽은 선이 더 낮았을 수 있어
//     남은 것 중 최저를 기준선이라 부르면 틀린 걸 단언하게 된다(axis.ts 규칙 3 — 지어내지 않는다).
import { anchorCoordKey, BASELINE_PARAM, beatsAsBaseline, candlePrice, chartKeyOf, type AnchorField, type AnchorMarket, type ChartAnchor, type DailyCandle, type MinuteCandle, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import type { AxisDeps } from "../axis/axis.js";

/** (종목,날) 동시 읽기 상한 — 축들과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

/** 가격까지 풀린 선 하나. */
export interface BaselineLevel {
    price: number;
    /** 이 선이 축들이 쓰는 그 기준선인가(가격 최저·타이=좌표 최신). 확정 불가면 전부 false. */
    baseline: boolean;
}

/**
 * 타점들이 속한 차트의 **모든 기준선 앵커**를 가격까지 푼다.
 * 반환 맵: 차트키 → 선 목록(가격 오름차순). 선이 하나도 안 풀린 차트는 키 자체가 없다.
 */
export async function resolveBaselineLevels(
    points: readonly ReviewPointKey[],
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "adjDaily" | "minute">,
): Promise<Map<string, BaselineLevel[]>> {
    return resolveBaselineLevelsForCharts(new Set(points.map(chartKeyOf)), anchors, deps);
}

/** 위와 같되 범위를 차트 집합으로 직접 받는다(타점 없는 차트도 선을 갖는다 — 선 역시 차트 소유다). */
export async function resolveBaselineLevelsForCharts(
    charts: ReadonlySet<string>,
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "adjDaily" | "minute">,
): Promise<Map<string, BaselineLevel[]>> {
    type Candidate = ChartAnchor & { field: AnchorField; market: AnchorMarket };
    const byChart = new Map<string, Candidate[]>();
    for (const a of anchors) {
        if (a.param !== BASELINE_PARAM || a.time != null) continue; // 차트 소유만(baselineResolver 와 같은 범위)
        if (a.field == null || a.market == null) continue; // 가격 앵커만
        const key = chartKeyOf(a);
        if (!charts.has(key)) continue;
        const list = byChart.get(key);
        if (list) list.push(a as Candidate);
        else byChart.set(key, [a as Candidate]);
    }
    if (byChart.size === 0) return new Map();

    // 앵커가 지목한 **그 캔들 하루치**만 읽는다(골격처럼 창 전체를 읽을 이유가 없다).
    const dailyKeys = new Map<string, { stockCode: string; date: string }>();
    const minuteKeys = new Map<string, { stockCode: string; date: string }>();
    for (const list of byChart.values()) {
        for (const a of list) {
            const k = `${a.stockCode}|${a.anchorDate}`;
            if (a.anchorTime) minuteKeys.set(k, { stockCode: a.stockCode, date: a.anchorDate });
            else dailyKeys.set(k, { stockCode: a.stockCode, date: a.anchorDate });
        }
    }
    const dailyByKey = new Map<string, DailyCandle | undefined>();
    await mapWithConcurrency([...dailyKeys.values()], DAY_CONCURRENCY, async (d) => {
        const rows = await deps.adjDaily.getDailyCandles(d.stockCode, { from: d.date, to: d.date });
        dailyByKey.set(`${d.stockCode}|${d.date}`, rows.find((r) => r.date === d.date));
    });
    const minutesByKey = new Map<string, MinuteCandle[]>();
    await mapWithConcurrency([...minuteKeys.values()], DAY_CONCURRENCY, async (d) => {
        minutesByKey.set(`${d.stockCode}|${d.date}`, await deps.minute.getMinuteCandles(d.stockCode, d.date));
    });

    const out = new Map<string, BaselineLevel[]>();
    for (const [key, list] of byChart) {
        const priced: { price: number; coord: string }[] = [];
        let anyMissing = false;
        for (const a of list) {
            const raw = a.anchorTime
                ? (minutesByKey.get(`${a.stockCode}|${a.anchorDate}`)?.find((c) => c.time === a.anchorTime)?.[a.market] ?? undefined)?.[a.field]
                : dailyByKey.get(`${a.stockCode}|${a.anchorDate}`)?.[a.market]?.[a.field];
            const price = candlePrice(raw);
            if (price === null) { anyMissing = true; continue; } // 그 선만 빠진다
            priced.push({ price, coord: anchorCoordKey(a) });
        }
        if (priced.length === 0) continue;
        // 기준선 표시 — 못 읽은 선이 하나라도 있으면 단언하지 않는다(그 선이 더 낮았을 수 있다).
        let best: { price: number; coord: string } | null = null;
        if (!anyMissing) for (const c of priced) if (!best || beatsAsBaseline(c, best)) best = c;
        out.set(
            key,
            priced
                .map((c) => ({ price: c.price, baseline: best !== null && c.price === best.price && c.coord === best.coord }))
                .sort((a, b) => a.price - b.price),
        );
    }
    return out;
}
