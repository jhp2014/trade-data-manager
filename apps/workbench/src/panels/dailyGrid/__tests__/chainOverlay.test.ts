// 사슬 층 입력 변환 — 사슬 끝 = 마지막 **거래** 봉(차트엔 채움봉이 없다), 후보는 ◇ 로 남았는지로 갈리고,
// 밴드 면은 UN% → 가격 → 차트% 정확 환산.
import { describe, expect, it } from "vitest";
import { DEFAULT_CHAIN_FILTER, breakoutChainsOf, chainVerdicts, type ChainSeries } from "@trade-data-manager/market/domain";
import { chainOverlayInputOf, chainSourceRowsOf } from "../useChainOverlay.js";

const T0 = 1_750_000_000;
const times = [0, 1, 2, 3, 4, 5].map((k) => T0 + k * 60);
/** [고가%, 저가%, 분 대금(억)] — 대금 0 = 채움봉. */
function series(bars: [number, number, number][]): ChainSeries {
    let cum = 0;
    return {
        minuteOpen: bars.map((b) => b[1]),
        minuteHigh: bars.map((b) => b[0]),
        minuteLow: bars.map((b) => b[1]),
        rate: bars.map((b) => b[0]),
        cumAmount: bars.map((b) => (cum += b[2] * 1e8)),
    };
}
const K = { zigzagPct: 2, bandPct: 1 };

describe("chainOverlayInputOf", () => {
    it("장 끝까지 산 사슬의 끝 = 마지막 거래 봉(뒤의 채움봉이 아니다)", () => {
        const s = series([[0, -0.5, 20], [0.1, 0, 10], [0.2, 0.1, 10], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
        const r = breakoutChainsOf(s, null, K, { trace: true });
        expect(r.chains[0]!.end).toBeNull();
        const out = chainOverlayInputOf(times, r, chainVerdicts(r.bars, s, DEFAULT_CHAIN_FILTER), null, null);
        expect(out.chains).toEqual([{ from: times[0], to: times[2], baselineFrom: null }]);
        expect(out.candidates).toEqual([{ time: times[0], label: "high", kept: false }]);
        expect(out.fills).toEqual([]); // 밴드 끔
    });

    it("후보는 ◇ 로 남았는지로 갈린다 — 모르면(null) 전부 통과(연한 쪽)", () => {
        const s = series([[0, -0.5, 20], [0.1, 0, 10], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
        const r = breakoutChainsOf(s, null, K);
        const v = chainVerdicts(r.bars, s, DEFAULT_CHAIN_FILTER);
        expect(chainOverlayInputOf(times, r, v, new Set([times[0]!]), null).candidates[0]!.kept).toBe(true);
        expect(chainOverlayInputOf(times, r, v, new Set(), null).candidates[0]!.kept).toBe(false);
        expect(chainOverlayInputOf(times, r, v, null, null).candidates[0]!.kept).toBe(false);
    });

    it("눌림으로 끝난 사슬의 끝 = 끝 봉 직전의 거래 봉(채움봉을 건너뛴다)", () => {
        const s = series([[0, -0.5, 20], [0.1, 0, 10], [0, 0, 0], [-0.5, -3, 10], [0, 0, 0], [0, 0, 0]]);
        const r = breakoutChainsOf(s, null, K);
        expect(r.chains[0]!.end).toBe(3);
        expect(chainOverlayInputOf(times, r, [], null, null).chains[0]!.to).toBe(times[1]);
    });

    it("밴드 면 환산 — UN 분모 10,000 · 차트 분모 10,100(KRX): UN 2% = 10,200원 = 차트 0.990…%", () => {
        const s = series([[2, 1, 20], [1.5, 1, 10], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
        const r = breakoutChainsOf(s, null, K, { trace: true });
        const out = chainOverlayInputOf(times, r, [], null, { unBase: 10_000, chartBase: 10_100 });
        expect(out.fills[0]!.pts[0]!.hi).toBeCloseTo(((10_200 - 10_100) / 10_100) * 100, 9);
        const same = chainOverlayInputOf(times, r, [], null, { unBase: 10_000, chartBase: 10_000 });
        expect(same.fills[0]!.pts[0]!.hi).toBeCloseTo(2, 9);
        expect(same.fills).toHaveLength(1); // 기준선 없음 → 기준선 밴드 면 없음
        expect(chainOverlayInputOf(times, r, [], null, { unBase: null, chartBase: 10_000 }).fills).toEqual([]);
    });
});

describe("chainSourceRowsOf — 켜지고 연동된 돌파 줄만, 이름 = 판 이름", () => {
    const bo = (id: string, enabled = true) => ({ id, enabled, predicates: [{ kind: "breakout" as const, zigzagPct: 2, bandPct: 0.5, chain: DEFAULT_CHAIN_FILTER }] });
    it("미연동·소멸된 판·꺼진 줄·돌파 아닌 줄은 빠진다(평가도 안 하는 줄을 차트만 그리지 않게)", () => {
        const stages = [
            bo("a"), bo("b"), bo("c"), bo("d", false),
            { id: "e", enabled: true, predicates: [{ kind: "candleShape" as const, shape: "bull" as const }] },
        ];
        const rows = chainSourceRowsOf(stages, { a: "daily-grid-2", c: "daily-grid-9", d: "daily-grid-1" }, ["daily-grid-1", "daily-grid-2"]);
        expect(rows.map((r) => [r.stageId, r.text, r.gridPanel])).toEqual([["a", "격자 2", "daily-grid-2"]]);
        expect(rows[0]!.full).toContain("돌파 2%/0.5%");
    });
});
