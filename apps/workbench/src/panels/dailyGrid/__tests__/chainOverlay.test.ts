// 사슬 층 입력 변환 — 사슬 끝 = 마지막 **거래** 봉(차트엔 채움봉이 없다), ① 계단은 UN% → 가격 → 차트% 정확 환산.
import { describe, expect, it } from "vitest";
import { breakoutChainsOf, chainVerdicts, type ChainSeries } from "@trade-data-manager/market/domain";
import { chainOverlayInputOf } from "../useChainOverlay.js";

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
        const out = chainOverlayInputOf(times, r, chainVerdicts(r.bars, s, { firstK: 1 }, "all"), null);
        expect(out.chains).toEqual([{ from: times[0], to: times[2], baselineFrom: null }]);
        expect(out.picks).toEqual([{ time: times[0], label: "high" }]);
        expect(out.steps).toEqual([]); // 밴드 선 끔
    });

    it("눌림으로 끝난 사슬의 끝 = 끝 봉 직전의 거래 봉(채움봉을 건너뛴다)", () => {
        const s = series([[0, -0.5, 20], [0.1, 0, 10], [0, 0, 0], [-0.5, -3, 10], [0, 0, 0], [0, 0, 0]]);
        const r = breakoutChainsOf(s, null, K);
        expect(r.chains[0]!.end).toBe(3);
        const out = chainOverlayInputOf(times, r, chainVerdicts(r.bars, s, { firstK: 1 }, "all"), null);
        expect(out.chains[0]!.to).toBe(times[1]);
    });

    it("① 계단 환산 — UN 분모 10,000 · 차트 분모 10,100(KRX): UN 2% = 10,200원 = 차트 0.990…%", () => {
        const s = series([[2, 1, 20], [1.5, 1, 10], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
        const r = breakoutChainsOf(s, null, K, { trace: true });
        const out = chainOverlayInputOf(times, r, [], { unBase: 10_000, chartBase: 10_100 });
        const top = out.steps[0]!.pts[0]!.value!;
        expect(top).toBeCloseTo(((10_200 - 10_100) / 10_100) * 100, 9);
        // 같은 분모(UN 보기)면 값이 그대로다.
        const same = chainOverlayInputOf(times, r, [], { unBase: 10_000, chartBase: 10_000 });
        expect(same.steps[0]!.pts[0]!.value).toBeCloseTo(2, 9);
        // 분모가 없으면 안 그린다(지어내지 않는다).
        expect(chainOverlayInputOf(times, r, [], { unBase: null, chartBase: 10_000 }).steps).toEqual([]);
    });
});
