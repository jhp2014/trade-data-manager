// 표시목록의 **내용 계약** — 화면이 아니라 목록을 상대로 굳힌다.
//
// 지금까지 이 규칙들은 DOM 을 세어 지켰다(`polyline` 몇 개, `strokeDasharray` 가 있나). 그림 층을
// 캔버스로 옮기면 그 DOM 이 통째로 사라지므로, 그 전에 계약을 목록 위로 올려 둔다 — 페인터가
// 바뀌어도 이 파일은 그대로다. 그게 표시목록을 만든 이유의 절반이다(나머지 절반은 프레임 비용).
//
// jsdom 이 필요 없다: 빌더는 순수 함수라 React 도 DOM 도 안 탄다.
import { describe, it, expect } from "vitest";
import { skeletonLinesLayer } from "../skeletonLinesLayer.js";
import { themeLinesLayer } from "../themeLinesLayer.js";
import { candleLayer } from "../candleLayer.js";
import { flatten, orderPaint, PAINT_ORDER, type DrawGroup, type DrawLayer, type DrawOp } from "../drawList.js";
import type { AmountRun, LineVisual, OverlayLine } from "../skeletonOverlay.js";
import type { CandleSet } from "../useCandles.js";
import type { ThemeOverlay } from "../useThemeOverlay.js";

// ── 재료 ──────────────────────────────────────────────────────────────────────

const scales = { x: (v: number) => 100 + v * 10, y: (v: number) => 300 - v * 5 };
const box = { left: 46, top: 8, width: 900, height: 560 };

const BASE: LineVisual = { role: "base", width: 1.25, dim: false, recede: false };
const visualOf = (v: Partial<LineVisual> = {}) => () => ({ v: { ...BASE, ...v }, color: "#888" });

const chartLine = (): OverlayLine => ({
    kind: "chart", key: "005930|2026-07-08", chartKey: "005930|2026-07-08", stockCode: "005930", date: "2026-07-08",
    points: [{ x: 0, y: 0 }, { x: 3, y: 10 }, { x: 6, y: 5 }],
    basePrice: 10_000, baseRate: 0, baseT: 0,
});

/** 타점 단위 선 — 원점(자기 시각)이 과거/미래의 경계다. */
const pointLine = (): OverlayLine => ({
    kind: "point", key: "005930|2026-07-08|09:30:00", chartKey: "005930|2026-07-08", stockCode: "005930", date: "2026-07-08",
    time: "09:30:00", splitIdx: 1,
    points: [{ x: -5, y: -2 }, { x: 0, y: 0, synthetic: true }, { x: 5, y: 3 }],
    basePrice: 10_000, baseRate: 26.4, baseT: 570,
});

const noPins = { shown: () => false, isPinned: () => false };

const build = (over: Partial<Parameters<typeof skeletonLinesLayer>[0]> = {}): DrawLayer =>
    skeletonLinesLayer({
        lines: [chartLine()], scales, box,
        lineShown: () => true,
        visualOf: visualOf(),
        opacity: { dimmed: 0.15, recede: 0.3, base: 0.7 },
        isPointUnit: false,
        amounts: null,
        project: (pts) => flatten(pts, scales.x, scales.y),
        lineStep: 1,
        dotsForAll: false,
        pins: noPins,
        fmtX: (x) => `${Math.round(x)}일`,
        fmtPct: (v) => `${v.toFixed(1)}%`,
        timeOfMinutes: (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`,
        clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
        ...over,
    });

const opsOf = (l: DrawLayer): DrawOp[] => l.groups.flatMap((g) => g.ops);
const kind = <K extends DrawOp["op"]>(l: DrawLayer, k: K): Extract<DrawOp, { op: K }>[] =>
    opsOf(l).filter((o): o is Extract<DrawOp, { op: K }> => o.op === k);

// ── 골격선 ────────────────────────────────────────────────────────────────────

describe("골격선 표시목록", () => {
    it("타점 단위 선은 과거·미래로 갈리고 **미래만 점선** — 타점까지가 판단, 이후는 결과다", () => {
        const polys = kind(build({ lines: [pointLine()], isPointUnit: true }), "polyline");
        expect(polys).toHaveLength(2);
        expect(polys[0].dash).toBeUndefined();
        expect(polys[1].dash).toBe("4 4");
    });

    it("차트 단위 선은 한 줄 — 갈릴 자리(원점)가 뜻을 안 가진다", () => {
        const polys = kind(build(), "polyline");
        expect(polys).toHaveLength(1);
        expect(polys[0].dash).toBeUndefined();
    });

    it("점 예산 밖이고 짚지도 않았으면 피벗 점이 없다 — 점이 노드를 열 배로 부풀린다", () => {
        expect(kind(build({ dotsForAll: false }), "circle")).toHaveLength(0);
    });

    it("짚은 선은 예산과 무관하게 점이 찍힌다 — 조사 중인 선의 피벗은 읽혀야 한다", () => {
        const circles = kind(build({ visualOf: visualOf({ role: "selected" }) }), "circle");
        expect(circles).toHaveLength(3);
    });

    it("합성점(타점 종가)은 **속 빈 원** — 손으로 찍은 점과 구분된다", () => {
        const circles = kind(build({ lines: [pointLine()], isPointUnit: true, dotsForAll: true }), "circle");
        const hollow = circles.filter((c) => c.stroke !== undefined);
        expect(hollow).toHaveLength(1); // synthetic 한 점만
        expect(hollow[0].fill).toBe("var(--bg-primary)");
    });

    it("피벗 좌표는 **짚은 점에만** — 전부 띄우면 화면이 숫자로 뒤덮인다", () => {
        expect(kind(build({ dotsForAll: true }), "text")).toHaveLength(0);
        const shown = build({ pins: { shown: (_k, i) => i === 1, isPinned: () => false } });
        // 한 점에 값 둘(기간·%) — 각 축의 발치에 하나씩.
        expect(kind(shown, "text")).toHaveLength(2);
        // 그 점에서 두 축으로 내리는 점선도 함께.
        expect(kind(shown, "line").filter((o) => o.dash === "2 3")).toHaveLength(2);
    });

    it("겹친 투명도는 **곱**으로 내린다 — 예전 중첩 <g opacity> 와 같은 값이어야 한다", () => {
        const preview = build({ pins: { shown: (_k, i) => i === 1, isPinned: () => false } });
        const pinned = build({ pins: { shown: (_k, i) => i === 1, isPinned: (_k, i) => i === 1 } });
        const readout = (l: DrawLayer): DrawGroup => l.groups[l.groups.length - 1];
        // 선 알파(base 0.7) × 미리보기 0.75 / 붙잡으면 × 1.
        expect(readout(preview).opacity).toBeCloseTo(0.7 * 0.75);
        expect(readout(pinned).opacity).toBeCloseTo(0.7);
    });

    it("lineShown 이 아니면 목록에 아예 없다 — 테마 모드에선 라벨만 남는다", () => {
        expect(build({ lineShown: () => false }).groups).toHaveLength(0);
    });

    it("거래대금이 붙은 선은 런마다 폴리라인 — 선분마다 굵기가 다르다", () => {
        const runs: AmountRun[] = [
            { points: [{ x: -5, y: -2 }, { x: 0, y: 0 }], level: 2, maxAmount: 0, maxAt: { x: 0, y: 0 } },
            { points: [{ x: 0, y: 0 }, { x: 5, y: 3 }], level: 5, maxAmount: 0, maxAt: { x: 0, y: 0 } },
        ];
        const l = build({ lines: [pointLine()], isPointUnit: true, amounts: { key: pointLine().key, runs } });
        const polys = kind(l, "polyline");
        expect(polys).toHaveLength(2);
        expect(polys[0].width).not.toBe(polys[1].width); // 굵기가 대금을 진다
        // 미래 런은 점선 대신 **옅게**(조각이 분 단위라 점선이 굵기와 싸운다).
        expect(polys[1].opacity).toBe(0.4);
        expect(polys[1].dash).toBeUndefined();
    });
});

// ── 테마 선 ───────────────────────────────────────────────────────────────────

const themeOverlay = (): ThemeOverlay => ({
    t0: 570,
    lines: [{ code: "000660", points: [{ x: -5, y: -1 }, { x: 0, y: 0 }, { x: 5, y: 2 }] }],
} as unknown as ThemeOverlay);

const themeBuild = (over: Partial<Parameters<typeof themeLinesLayer>[0]> = {}): DrawLayer =>
    themeLinesLayer({
        overlay: themeOverlay(), runs: null, hovered: null,
        project: (pts) => flatten(pts, scales.x, scales.y),
        clip: null, lineStep: 1,
        ...over,
    });

describe("테마 선 표시목록", () => {
    it("미래 구간만 점선 — 앵커 선과 같은 문장이다", () => {
        const polys = kind(themeBuild(), "polyline");
        expect(polys).toHaveLength(2);
        expect(polys[0].dash).toBeUndefined();
        expect(polys[1].dash).toBe("4 4");
    });

    it("진하기 사다리 — 짚은 것 0.9 · 다른 걸 짚었으면 0.2 · 아무도 안 짚었으면 0.45", () => {
        expect(themeBuild().groups[0].opacity).toBe(0.45);
        expect(themeBuild({ hovered: new Set(["000660"]) }).groups[0].opacity).toBe(0.9);
        expect(themeBuild({ hovered: new Set(["999999"]) }).groups[0].opacity).toBe(0.2);
    });

    it("런이 있으면 **굵기가 거래대금**이고 색은 그대로 무채색", () => {
        const runs = new Map<string, AmountRun[]>([["000660", [
            { points: [{ x: -5, y: -1 }, { x: 0, y: 0 }], level: 1, maxAmount: 0, maxAt: { x: 0, y: 0 } },
            { points: [{ x: 0, y: 0 }, { x: 5, y: 2 }], level: 6, maxAmount: 0, maxAt: { x: 0, y: 0 } },
        ]]]);
        const polys = kind(themeBuild({ runs }), "polyline");
        expect(polys).toHaveLength(2);
        expect(polys[0].width).not.toBe(polys[1].width);
        expect(new Set(polys.map((p) => p.stroke))).toEqual(new Set(["var(--text-tertiary)"]));
    });
});

// ── 캔들 ──────────────────────────────────────────────────────────────────────

const candleSet = (): CandleSet => ({
    daily: true,
    anchor: [
        { x: 0, o: 100, h: 110, l: 95, c: 105, amount: 0, highPct: 3 },
        { x: 1000, o: 100, h: 110, l: 95, c: 105, amount: 0, highPct: 3 }, // 화면 밖
    ],
    members: [],
} as unknown as CandleSet);

describe("캔들 표시목록", () => {
    it("화면 밖 봉은 목록에 아예 없다 — 그릴 것을 만들지도 않는다", () => {
        const l = candleLayer({
            set: candleSet(), scales, box,
            anchorShown: true, memberShown: () => false, opacityOf: () => 0.35,
        });
        expect(kind(l, "rect")).toHaveLength(1); // 창 안 한 봉만
    });

    it("마커 묶음엔 알파가 없다 — 캔들은 배경이지만 마커는 사건이다", () => {
        const l = candleLayer({
            set: candleSet(), scales, box,
            anchorShown: true, memberShown: () => false, opacityOf: () => 0.35,
        });
        const withAlpha = l.groups.filter((g) => g.opacity !== undefined);
        const noAlpha = l.groups.filter((g) => g.opacity === undefined);
        expect(withAlpha.every((g) => g.ops.some((o) => o.op === "rect"))).toBe(true);
        expect(noAlpha.every((g) => g.ops.some((o) => o.op === "text"))).toBe(true);
    });

    it("앵커를 끄면 앵커 봉이 없다", () => {
        const l = candleLayer({
            set: candleSet(), scales, box,
            anchorShown: false, memberShown: () => false, opacityOf: () => 0.35,
        });
        expect(l.groups).toHaveLength(0);
    });
});

// ── 순서 ──────────────────────────────────────────────────────────────────────

describe("그리는 순서", () => {
    it("orderPaint 는 PAINT_ORDER 를 따른다 — 부르는 자리가 순서를 못 정한다", () => {
        const named = (name: string): DrawLayer => ({ name, groups: [] });
        const out = orderPaint({
            // 일부러 뒤섞어 넘긴다 — 순서는 인자 순이 아니라 상수가 정한다.
            "skeleton-lines": named("skeleton-lines"),
            candles: named("candles"),
            "theme-lines": named("theme-lines"),
        });
        expect(out.map((l) => l.name)).toEqual([...PAINT_ORDER]);
    });

    it("빌더가 내는 이름이 PAINT_ORDER 의 이름과 같다 — 어긋나면 층이 통째로 사라진다", () => {
        expect(build().name).toBe("skeleton-lines");
        expect(themeBuild().name).toBe("theme-lines");
        expect(candleLayer({
            set: candleSet(), scales, box, anchorShown: false, memberShown: () => false, opacityOf: () => 1,
        }).name).toBe("candles");
    });
});

// ── 좌표 눕히기 ───────────────────────────────────────────────────────────────

describe("flatten", () => {
    it("스케일을 통과시켜 [x0,y0,x1,y1,…] 로 눕힌다 — 점마다 객체를 새로 만들지 않으려고", () => {
        expect(flatten([{ x: 0, y: 0 }, { x: 3, y: 10 }], scales.x, scales.y)).toEqual([100, 300, 130, 250]);
    });
});
