// 기준선 리졸버 — 차트의 baseline 앵커(=그은 선들) 중 계산 축이 쓸 **하나**를 고르는 공용 규칙.
//
// 기준선이 다중이 된 뒤(선=앵커 통합) 축마다 각자 고르면 세 축이 서로 다른 선을 잴 수 있다 —
// 거리 축과 공백 축이 다른 선을 보는 상태는 조용히 생기고 화면으로 못 잡는다. 그래서 선택 규칙은 여기 한 곳.
//
// 규칙:
//   · 후보 0 → 그 차트는 결과에 없음(기준선 없음 — 축에서 "입력 전").
//   · 후보 1 → **가격을 읽지 않고** 확정. 거리 축의 견고성(앵커 캔들 값이 미수집이어도 좌표만으로 동작)이
//     흔한 경우(선 하나)에 그대로 보존된다.
//   · 후보 ≥2 → 각 후보의 가격을 읽어 **최저가**를 고른다(사용자 규칙: 아래 있는 선이 기준을 가져간다).
//     하나라도 못 읽으면 null(결손) — 못 읽은 선이 더 낮을 수 있어 "아무거나"를 고르면 조용한 오류다
//     (axis.ts 규칙 3: 지어내지 않는다). 같은 가격 타이는 **앵커 좌표가 최신인 것** — 그 가격대를 마지막으로
//     건드린 선이 살아있는 저항이고, 거리류 축에서 결정적이도록 좌표로 고정한다(비결정 금지).
//
// 타점 소유(time 있는) 앵커는 후보에서 뺀다 — 현재 레지스트리는 전부 chart 소유라 실데이터가 없고,
// 두 grain 의 병합 규칙은 첫 "both" param 이 실사용례를 들고 올 때 정한다(상상으로 미리 정하지 않는다).
import { BASELINE_PARAM, type AnchorField, type AnchorMarket, type ChartAnchor, type DailyCandle, type MinuteCandle, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import type { AxisDeps } from "../axis/axis.js";

/** 가격 앵커로 좁힌 기준선 후보 — field·market 쌍이 있어야 값을 꺼낼 수 있다. */
export type BaselineAnchor = ChartAnchor & { field: AnchorField; market: AnchorMarket };

/** 차트 키 — 리졸버 결과 맵의 키. 축들이 같은 문자열을 만들도록 여기서 제공. */
export const chartKeyOf = (c: { stockCode: string; date: string }): string => `${c.stockCode}|${c.date}`;

/** (종목,날) 동시 읽기 상한 — 축들과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

/**
 * 타점들이 속한 차트의 기준선을 일괄 확정한다.
 * 반환 맵: 차트키 → 확정 기준선. **키 없음 = 후보 없음**(입력 전) / **null = 후보 ≥2 인데 확정 불가**(결손).
 * 소비 축은 non-null 만 잡으면 두 경우 모두 자연히 빠진다.
 */
export async function resolveBaselines(
    points: readonly ReviewPointKey[],
    anchors: readonly ChartAnchor[],
    deps: Pick<AxisDeps, "adjDaily" | "minute">,
): Promise<Map<string, BaselineAnchor | null>> {
    const charts = new Set(points.map(chartKeyOf));
    const candidates = new Map<string, BaselineAnchor[]>();
    for (const a of anchors) {
        if (a.param !== BASELINE_PARAM || a.time != null) continue;
        if (a.field == null || a.market == null) continue; // 가격 앵커만 유효(서버 검증 — 방어적으로 거른다)
        const key = chartKeyOf(a);
        if (!charts.has(key)) continue;
        const list = candidates.get(key);
        if (list) list.push(a as BaselineAnchor);
        else candidates.set(key, [a as BaselineAnchor]);
    }

    const out = new Map<string, BaselineAnchor | null>();
    const multi: { key: string; cands: BaselineAnchor[] }[] = [];
    for (const [key, cands] of candidates) {
        if (cands.length === 1) out.set(key, cands[0]); // 가격 안 읽고 확정
        else multi.push({ key, cands });
    }
    if (multi.length === 0) return out;

    // 가격 읽기 — 다중 차트의 후보만. 일봉 앵커 = 그 하루짜리 수정주가, 분봉 앵커 = 그 날 분봉(드묾).
    const dailyKeys = new Map<string, { stockCode: string; date: string }>();
    const minuteKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { cands } of multi) {
        for (const a of cands) {
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

    for (const { key, cands } of multi) {
        let best: BaselineAnchor | null = null;
        let bestPrice = Infinity;
        for (const a of cands) {
            const price = anchorPrice(a, dailyByKey, minutesByKey);
            if (price === null) { best = null; break; } // 못 읽은 후보가 더 낮을 수 있다 — 확정 불가(결손)
            if (price < bestPrice || (price === bestPrice && best !== null && laterCoord(a, best))) {
                best = a;
                bestPrice = price;
            }
        }
        out.set(key, best);
    }
    return out;
}

/** 후보 하나의 가격 — 앵커가 지목한 캔들의 그 시장·그 값. 미수집/0/비수치는 null. */
function anchorPrice(a: BaselineAnchor, dailyByKey: Map<string, DailyCandle | undefined>, minutesByKey: Map<string, MinuteCandle[]>): number | null {
    const raw = a.anchorTime
        ? (minutesByKey.get(`${a.stockCode}|${a.anchorDate}`)?.find((c) => c.time === a.anchorTime)?.[a.market] ?? undefined)?.[a.field]
        : dailyByKey.get(`${a.stockCode}|${a.anchorDate}`)?.[a.market]?.[a.field];
    if (raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
}

/** 좌표 최신 비교 — (anchorDate, anchorTime) 사전순. 타이브레이크 전용. */
function laterCoord(a: BaselineAnchor, b: BaselineAnchor): boolean {
    const ka = `${a.anchorDate}T${a.anchorTime ?? ""}`;
    const kb = `${b.anchorDate}T${b.anchorTime ?? ""}`;
    return ka > kb;
}
