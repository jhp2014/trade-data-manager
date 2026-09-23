// 격자판 표시목록 — 층 순서가 뜻이고(사슬 띠 → 캔들 → 밴드 → 기준선 → ▼), 밴드가 없는 구간은 선이 끊긴다.
import { describe, expect, it } from "vitest";
import { breakoutOfStock } from "@trade-data-manager/market/domain";
import { gridLayers, viewRangeOf, type GridSeries } from "../gridLayers.js";

const s: GridSeries & { basePrice: { un: number | null } } = {
    minuteOpen: [-0.5, -0.1, 0, 0, 0.1],
    minuteHigh: [0, -0.2, 0.3, 0.1, 0.2],
    minuteLow: [-0.5, -0.8, 0, -0.3, -1.8],
    rate: [0, -0.5, 0.2, 0.1, -1],
    cumAmount: [20e8, 70e8, 110e8, 170e8, 240e8],
    basePrice: { un: 10_000 },
};
const box = { left: 0, top: 0, width: 500, height: 200 };

describe("gridLayers", () => {
    const r = breakoutOfStock(s, 10_010, { zigzagPct: 2, bandPct: 1 }, { trace: true });
    const range = viewRangeOf(s, 0, 4, r.baselinePct)!;
    const layers = gridLayers(s, r, { from: 0, to: 4, ...range }, box);

    it("층 순서 = 사슬 띠 → 캔들 → 밴드 → 기준선 → ▼ → 눈금", () => {
        expect(layers.map((l) => l.name)).toEqual(["chains", "candles", "bands", "baseline", "marks", "axis"]);
    });

    it("▼ 는 후보 수만큼, 첫 사건만 채운 ▼", () => {
        const marks = layers.find((l) => l.name === "marks")!.groups.flatMap((g) => g.ops);
        expect(marks.map((m) => (m.op === "text" ? m.text : ""))).toEqual(["▼", "▽", "▽"]);
    });

    it("기준선 밴드가 소멸한 뒤로는 그 선이 끊긴다(null 구간)", () => {
        // 기준선 0.1% 는 분 2(고가 0.3)에서 뚫려 소멸 — 분 0~1 만 이어진 계단이다.
        const baseDash = layers.find((l) => l.name === "baseline")!.groups.flatMap((g) => g.ops)
            .filter((o) => o.op === "polyline");
        expect(baseDash).toHaveLength(1);
        expect(baseDash[0]!.op === "polyline" && baseDash[0]!.pts.length).toBe(2 * 4);
    });

    it("거래 없는 구간이면 범위가 없다(그림 대신 사유)", () => {
        const flat = { ...s, cumAmount: [0, 0, 0, 0, 0] };
        expect(viewRangeOf(flat, 0, 4, null)).toBeNull();
    });
});
