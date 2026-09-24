// 사슬 층 스펙 — 차트 봉에 없는 시각은 버리고(지어내지 않는다), 사슬 띠는 기준선 합류 봉에서 갈리고,
// 후보 세로 줄은 ◇ 로 남았는지로 진하기가 갈리며(통과 < ◇, 겹친 결과가 목표 진하기), 밴드 면은 차트 봉만 남는다.
import { describe, expect, it } from "vitest";
import { CHAIN_ALPHA, buildChainLayerSpec } from "../chainLayer.js";
import { BREAKOUT_BASE, BREAKOUT_HIGH } from "../../styles/palette.js";
import type { MinutePoint } from "../../lib/derive.js";

const T0 = 1_750_000_000;
const bar = (k: number): MinutePoint =>
    ({ time: T0 + k * 60, high: k, low: k - 1, open: k - 0.5, close: k - 0.2, amount: 1e8 }) as unknown as MinutePoint;
// 봉 3(분 3)은 거래가 없어 차트에 없다.
const points = [bar(0), bar(1), bar(2), bar(4), bar(5)];
const t = (k: number): number => T0 + k * 60;
const none = { chains: [], candidates: [], fills: [] };
/** 겹친 결과 진하기 — 사슬 띠 위에 세로 줄. */
const composite = (a: number): number => CHAIN_ALPHA.chain + a * (1 - CHAIN_ALPHA.chain);

describe("buildChainLayerSpec", () => {
    it("사슬 띠는 기준선 합류 봉에서 두 토막 — 앞 토막은 합류 직전 **차트 봉**까지", () => {
        const spec = buildChainLayerSpec(points, { ...none, chains: [{ from: t(0), to: t(5), baselineFrom: t(4) }] });
        expect(spec.strips).toEqual([
            { from: t(0), to: t(2), color: BREAKOUT_HIGH, alpha: CHAIN_ALPHA.chain },
            { from: t(4), to: t(5), color: BREAKOUT_BASE, alpha: CHAIN_ALPHA.chain },
        ]);
    });

    it("후보 세로 줄 — 통과는 살짝, ◇ 로 남은 봉은 조금 더 진하게(겹친 뒤 목표 진하기)", () => {
        const spec = buildChainLayerSpec(points, {
            ...none,
            candidates: [{ time: t(1), label: "high", kept: false }, { time: t(2), label: "baseline", kept: true }],
        });
        expect(spec.strips.map((s) => [s.from, s.color])).toEqual([[t(1), BREAKOUT_HIGH], [t(2), BREAKOUT_BASE]]);
        expect(composite(spec.strips[0]!.alpha)).toBeCloseTo(CHAIN_ALPHA.pass, 9);
        expect(composite(spec.strips[1]!.alpha)).toBeCloseTo(CHAIN_ALPHA.kept, 9);
        expect(CHAIN_ALPHA.chain < CHAIN_ALPHA.pass && CHAIN_ALPHA.pass < CHAIN_ALPHA.kept).toBe(true);
    });

    it("차트 봉에 없는 시각의 사슬·후보는 버린다", () => {
        const spec = buildChainLayerSpec(points, {
            chains: [{ from: t(3), to: t(5), baselineFrom: null }],
            candidates: [{ time: t(3), label: "high", kept: true }],
            fills: [],
        });
        expect(spec.strips).toEqual([]);
    });

    it("밴드 면 점은 차트 봉만 남고, null 은 끊김으로 남긴다", () => {
        const spec = buildChainLayerSpec(points, {
            ...none,
            fills: [{ color: BREAKOUT_HIGH, pts: [0, 1, 2, 3, 4].map((k) => ({ time: t(k) as never, lo: k === 1 ? null : k - 1, hi: k })) }],
        });
        expect(spec.fills[0]!.pts.map((p) => [(p.time as number - T0) / 60, p.lo])).toEqual([[0, -1], [1, null], [2, 1], [4, 3]]);
    });
});
