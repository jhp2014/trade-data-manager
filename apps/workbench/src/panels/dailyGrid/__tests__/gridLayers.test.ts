// 격자판 표시목록 — 층 순서가 뜻이고(사슬 띠 → 캔들 → 밴드 → 기준선 → ▼), 밴드가 없는 구간은 선이 끊긴다.
// 레인은 차트와 같은 x 를 쓰고, 봉 폭이 좁으면 안 그린다. 보는 구간 산수는 하루 밖으로 안 샌다.
import { describe, expect, it } from "vitest";
import { breakoutOfStock, chainVerdicts } from "@trade-data-manager/market/domain";
import { LANE_MIN_BW, gridLayers, laneLayers, navLayers, viewRangeOf, xScaleOf, type GridSeries } from "../gridLayers.js";
import { MIN_SPAN, chainSpanOf, clampSpan, initialSpan, panBy, zoomAt } from "../viewport.js";

const T0 = 1_750_000_000 - (1_750_000_000 % 60);
const s: GridSeries & { basePrice: { un: number | null } } = {
    times: [0, 1, 2, 3, 4].map((k) => T0 + k * 60),
    minuteOpen: [-0.5, -0.1, 0, 0, 0.1],
    minuteHigh: [0, -0.2, 0.3, 0.1, 0.2],
    minuteLow: [-0.5, -0.8, 0, -0.3, -1.8],
    rate: [0, -0.5, 0.2, 0.1, -1],
    cumAmount: [20e8, 70e8, 110e8, 170e8, 240e8],
    basePrice: { un: 10_000 },
};
const box = { left: 0, top: 0, width: 500, height: 200 };
const opsOf = (layers: ReturnType<typeof gridLayers>, name: string) =>
    layers.find((l) => l.name === name)?.groups.flatMap((g) => g.ops) ?? [];

describe("gridLayers", () => {
    const r = breakoutOfStock(s, 10_010, { zigzagPct: 2, bandPct: 1 }, { trace: true });
    const v = chainVerdicts(r.bars, s, { amountEok: 45, firstK: 1 }, "all");
    const range = viewRangeOf(s, 0, 4, r.baselinePct)!;
    const layers = gridLayers(s, r, v, { x0: 0, x1: 5, ...range }, box, 2);

    it("층 순서 = 사슬 띠 → 캔들 → 밴드 → 기준선 → ▼ → 포커스 → 눈금", () => {
        expect(layers.map((l) => l.name)).toEqual(["chains", "candles", "bands", "baseline", "marks", "focus", "axis"]);
    });

    it("▼ = 최종 후보, ▽ = 봉 조건 통과·순번 밖, 탈락 봉은 표식 없음", () => {
        // 사슬 봉 0~3 · 45억 이상 = 분 1(50)·3(60) → 처음 1개 = 분 1 ▼, 분 3 ▽.
        const marks = opsOf(layers, "marks").map((m) => (m.op === "text" ? m.text : ""));
        expect(marks.sort()).toEqual(["▼", "▽"].sort());
    });

    it("기준선 밴드가 소멸한 뒤로는 그 선이 끊긴다(null 구간)", () => {
        // 기준선 0.1% 는 분 2(고가 0.3)에서 뚫려 소멸 — 분 0~1 만 이어진 계단이다.
        const baseDash = opsOf(layers, "baseline").filter((o) => o.op === "polyline");
        expect(baseDash).toHaveLength(1);
        expect(baseDash[0]!.op === "polyline" && baseDash[0]!.pts.length).toBe(2 * 4);
    });

    it("확대하면 보이는 봉만 — 캔들은 구간 안 거래 봉 수 × 2(꼬리+몸통)", () => {
        const zoomed = gridLayers(s, r, v, { x0: 1, x1: 3, ...range }, box);
        expect(opsOf(zoomed, "candles")).toHaveLength(2 * 2);
    });

    it("거래 없는 구간이면 범위가 없다(그림 대신 사유)", () => {
        const flat = { ...s, cumAmount: [0, 0, 0, 0, 0] };
        expect(viewRangeOf(flat, 0, 4, null)).toBeNull();
    });
});

describe("laneLayers — 차트와 같은 x, 좁으면 안 그림", () => {
    const r = breakoutOfStock(s, null, { zigzagPct: 2, bandPct: 1 });
    const v = chainVerdicts(r.bars, s, { amountEok: 45, firstK: 1 }, "all");

    it("조건 줄 칸 = 사슬 봉 수, 칸의 가운데 = 차트 봉 가운데", () => {
        const lanes = laneLayers(v, ["amount"], { x0: 0, x1: 5 }, box, 5);
        const cells = lanes.find((l) => l.name === "lanes")!.groups.flatMap((g) => g.ops).filter((o) => o.op === "rect");
        // 조건 줄 4칸(사슬 봉 0~3) + 순번 줄 2칸(통과 봉 1·3)
        expect(cells).toHaveLength(4 + 2);
        const xs = xScaleOf({ x0: 0, x1: 5 }, box, 5);
        const centers = cells.map((c) => (c.op === "rect" ? c.x + c.w / 2 : NaN));
        expect(Math.min(...centers)).toBeCloseTo(xs.cx(0), 6);
        expect(Math.max(...centers)).toBeCloseTo(xs.cx(3), 6);
    });

    it(`봉 폭 < ${LANE_MIN_BW}px 이면 빈 목록`, () => {
        expect(laneLayers(v, ["amount"], { x0: 0, x1: 5 }, { ...box, width: 5 * (LANE_MIN_BW - 1) }, 5)).toEqual([]);
    });

    it("길잡이 띠는 하루 전체 + 보는 창 사각형", () => {
        const nav = navLayers(s, r, v, { x0: 1, x1: 3 }, { left: 0, top: 0, width: 500, height: 20 });
        expect(nav.map((l) => l.name)).toEqual(["nav-chains", "nav-line", "nav-window"]);
        const win = nav.find((l) => l.name === "nav-window")!.groups[0]!.ops[0]!;
        expect(win.op === "rect" && [win.x, win.w]).toEqual([100, 200]);
    });
});

describe("viewport — 하루 밖으로 안 샌다", () => {
    const n = 100;
    it("폭은 [MIN_SPAN, n], 위치는 밀어 넣는다", () => {
        expect(clampSpan({ x0: -10, x1: 20 }, n)).toEqual({ x0: 0, x1: 30 });
        expect(clampSpan({ x0: 90, x1: 120 }, n)).toEqual({ x0: 70, x1: 100 });
        expect(clampSpan({ x0: 50, x1: 51 }, n).x1 - clampSpan({ x0: 50, x1: 51 }, n).x0).toBe(MIN_SPAN);
        expect(clampSpan({ x0: -50, x1: 500 }, n)).toEqual({ x0: 0, x1: 100 });
    });

    it("확대는 커서 자리를 제자리에 둔다", () => {
        const z = zoomAt({ x0: 0, x1: 100 }, 40, 0.5, n);
        expect(z).toEqual({ x0: 20, x1: 70 });
    });

    it("이동은 폭을 안 깎는다", () => {
        expect(panBy({ x0: 80, x1: 95 }, 20, n)).toEqual({ x0: 85, x1: 100 });
    });

    it("처음 화면 — 포커스가 사슬 안이면 그 사슬(끝 봉 포함 + 여유), 아니면 하루 전체", () => {
        const chains = [{ start: 30, end: 40, high: 1, baselineFrom: null }];
        expect(initialSpan(chains, 35, n)).toEqual(chainSpanOf(chains[0]!, n));
        expect(initialSpan(chains, 40, n)).toEqual(chainSpanOf(chains[0]!, n));
        expect(initialSpan(chains, 50, n)).toEqual({ x0: 0, x1: 100 });
        expect(initialSpan(chains, null, n)).toEqual({ x0: 0, x1: 100 });
        const cs = chainSpanOf(chains[0]!, n);
        expect(cs.x0 <= 30 && cs.x1 >= 41).toBe(true);
    });
});
