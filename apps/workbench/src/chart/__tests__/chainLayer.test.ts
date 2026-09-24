// 사슬 층 스펙 — 차트 봉에 없는 시각은 버리고(지어내지 않는다), 띠는 기준선 합류 봉에서 갈리고,
// ▼ 는 그 봉 고가 + 예약 간격, 계단 점은 차트 봉만 남는다.
import { describe, expect, it } from "vitest";
import { buildChainLayerSpec } from "../chainLayer.js";
import { BREAKOUT_BASE, BREAKOUT_HIGH } from "../../styles/palette.js";
import type { MinutePoint } from "../../lib/derive.js";

const T0 = 1_750_000_000;
const bar = (k: number, high: number): MinutePoint =>
    ({ time: T0 + k * 60, high, low: high - 1, open: high - 0.5, close: high - 0.2, amount: 1e8 }) as unknown as MinutePoint;
// 봉 3(분 3)은 거래가 없어 차트에 없다.
const points = [bar(0, 1), bar(1, 2), bar(2, 3), bar(4, 5), bar(5, 4)];
const t = (k: number): number => T0 + k * 60;

describe("buildChainLayerSpec", () => {
    it("띠는 기준선 합류 봉에서 두 토막 — 앞 토막은 합류 직전 **차트 봉**까지", () => {
        const spec = buildChainLayerSpec(points, { chains: [{ from: t(0), to: t(5), baselineFrom: t(4) }], picks: [], steps: [] }, () => 8);
        expect(spec.bands).toEqual([
            { from: t(0), to: t(2), color: BREAKOUT_HIGH },
            { from: t(4), to: t(5), color: BREAKOUT_BASE },
        ]);
    });

    it("합류가 첫 봉이면 한 토막(전부 기준선), 합류 없으면 한 토막(전부 고가)", () => {
        const a = buildChainLayerSpec(points, { chains: [{ from: t(0), to: t(2), baselineFrom: t(0) }], picks: [], steps: [] }, () => 8);
        expect(a.bands).toEqual([{ from: t(0), to: t(2), color: BREAKOUT_BASE }]);
        const b = buildChainLayerSpec(points, { chains: [{ from: t(1), to: t(2), baselineFrom: null }], picks: [], steps: [] }, () => 8);
        expect(b.bands).toEqual([{ from: t(1), to: t(2), color: BREAKOUT_HIGH }]);
    });

    it("차트 봉에 없는 시각의 사슬·▼ 는 버린다", () => {
        const spec = buildChainLayerSpec(points, {
            chains: [{ from: t(3), to: t(5), baselineFrom: null }],
            picks: [{ time: t(3), label: "high" }, { time: t(4), label: "baseline" }],
            steps: [],
        }, () => 8);
        expect(spec.bands).toEqual([]);
        expect(spec.marks).toEqual([{ time: t(4), value: 5, gap: 8, color: BREAKOUT_BASE }]);
    });

    it("▼ 간격은 호출부 규칙(마커 예약분)을 그대로 쓴다", () => {
        const spec = buildChainLayerSpec(points, { chains: [], picks: [{ time: t(1), label: "high" }], steps: [] }, (p) => (p.high === 2 ? 24 : 8));
        expect(spec.marks[0]!.gap).toBe(24);
    });

    it("계단 점은 차트 봉만 남는다(채움봉 자리마다 선이 끊기지 않게), null 은 끊김으로 남긴다", () => {
        const spec = buildChainLayerSpec(points, {
            chains: [], picks: [],
            steps: [{ color: BREAKOUT_HIGH, dash: [], pts: [0, 1, 2, 3, 4].map((k) => ({ time: t(k) as never, value: k === 1 ? null : k })) }],
        }, () => 8);
        expect(spec.steps[0]!.pts.map((p) => [(p.time as number - T0) / 60, p.value])).toEqual([[0, 0], [1, null], [2, 2], [4, 4]]);
    });
});
