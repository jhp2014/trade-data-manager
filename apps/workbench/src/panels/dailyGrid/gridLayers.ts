// 격자판 그림의 **표시목록 빌더** — 순수(같은 입력 = 같은 목록). drawList 계약(골격·테이프와 같은 것).
//
// 판은 세 그림이 **같은 x축**을 쓴다: 차트(`gridLayers`) · 사슬 필터 레인(`laneLayers`) · 하루 길잡이 띠
// (`navLayers` — 이것만 하루 전체 x). x 는 보는 구간 `[x0, x1)`(시계열 인덱스, 실수 — 확대·이동이 봉 경계에
// 안 묶인다)에서 `xScaleOf` 한 벌로 나온다. 레인이 차트와 따로 x 를 계산하면 확대 한 번에 줄이 어긋난다.
//
// 차트 층 순서(먼저가 아래) — 순서가 뜻이다:
//   사슬 띠 → 캔들 → 러닝 밴드(상단 실선·하단 점선) → 기준선·기준선 밴드 하단 → 후보 ▼ → 포커스 시각 → 눈금
//   · 사슬 띠가 맨 아래 — "이 구간이 한 사슬"이라는 배경이고, 캔들이 그 위에서 읽혀야 한다.
//   · 밴드가 캔들 위 — 봉이 하단에 닿았나(사건)를 선이 캔들을 가로질러 보여 준다.
//   · ▼ 가 위 — 주인공(후보)이 무엇에도 안 덮인다.
// 밴드 궤적은 **봉 처리 뒤의 상태**(breakoutChainsOf trace)라 계단으로 그린다 — 선을 비스듬히 이으면
// 없던 가격이 그려진다.
import {
    minuteOfDayOf,
    type BreakoutChainResult,
    type BreakoutLabel,
    type ChainCheck,
    type ChainVerdict,
} from "@trade-data-manager/market/domain";
import { compact, type DrawLayer, type DrawOp } from "../canvas/drawList.js";
import { BREAKOUT_BASE, BREAKOUT_HIGH, CHAIN_FAIL, CHAIN_PASS, MARKER_NOW } from "../../styles/palette.js";
import { CHECK_NAME } from "./chainChecks.js";

/** 그림 재료 — `/day-replay` 종목(%)의 쓰는 필드. */
export interface GridSeries {
    /** 봉 시각(unix 초). */
    times: readonly number[];
    minuteOpen: readonly number[];
    minuteHigh: readonly number[];
    minuteLow: readonly number[];
    rate: readonly number[];
    cumAmount: readonly number[];
}

export interface GridBox { left: number; top: number; width: number; height: number }

/** 보는 구간 — `[x0, x1)` 시계열 인덱스(실수). */
export interface GridSpan { x0: number; x1: number }
/** 보는 구간 + 그 구간의 값 범위(%). */
export interface GridView extends GridSpan { lo: number; hi: number }

export interface XScale {
    /** 봉 한 칸 폭(px). */
    bw: number;
    /** 봉 i 의 가운데 x. */
    cx: (i: number) => number;
    /** x(px) 아래의 봉 인덱스(범위 밖일 수 있다). */
    idxAt: (px: number) => number;
    /** 보이는 첫·끝 봉(0..n-1 로 잘림). */
    first: number;
    last: number;
}

export function xScaleOf(span: GridSpan, box: GridBox, n: number): XScale {
    const bw = box.width / Math.max(1e-9, span.x1 - span.x0);
    return {
        bw,
        cx: (i) => box.left + (i + 0.5 - span.x0) * bw,
        idxAt: (px) => Math.floor(span.x0 + (px - box.left) / bw),
        first: Math.max(0, Math.floor(span.x0)),
        last: Math.min(n - 1, Math.ceil(span.x1) - 1),
    };
}

export const labelColor = (l: BreakoutLabel): string => (l === "baseline" ? BREAKOUT_BASE : BREAKOUT_HIGH);

const RISE = "var(--rise)";
const FALL = "var(--fall)";
const AXIS_TEXT = "var(--text-tertiary)";
const HALO = { color: "var(--bg-primary)", width: 2 };

const tvAt = (s: Pick<GridSeries, "cumAmount">, i: number): number => s.cumAmount[i] - (i > 0 ? s.cumAmount[i - 1] : 0);

/** 구간의 값 범위 — 거래 봉의 고가·저가(+ 가까운 기준선). 비면 null. */
export function viewRangeOf(s: GridSeries, from: number, to: number, baselinePct: number | null): { lo: number; hi: number } | null {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = Math.max(0, from); i <= Math.min(to, s.minuteHigh.length - 1); i++) {
        if (!(tvAt(s, i) > 0)) continue;
        lo = Math.min(lo, s.minuteLow[i]);
        hi = Math.max(hi, s.minuteHigh[i]);
    }
    if (lo === Infinity) return null;
    // 기준선은 가까우면(구간 폭의 절반 안) 함께 보인다 — 멀면 캔들이 납작해진다.
    if (baselinePct !== null && baselinePct > hi && baselinePct - hi < (hi - lo) * 0.5) hi = baselinePct;
    const pad = Math.max((hi - lo) * 0.06, 0.1);
    return { lo: lo - pad, hi: hi + pad };
}

/** 시간 눈금 간격(분) — 눈금 사이가 이 px 이상이 되는 가장 작은 값. */
const TICK_STEPS = [1, 5, 10, 15, 30, 60, 120] as const;
const tickStepOf = (bw: number): number => TICK_STEPS.find((m) => m * bw >= 56) ?? 120;

/**
 * 차트 — `verdicts` 는 사슬 봉 판정(chainVerdicts): 최종 후보 = ▼, 봉 조건은 통과했지만 순번 밖 = 흐린 ▽.
 * `focusIdx` = 포커스 시각의 봉(세로 점선).
 */
export function gridLayers(
    s: GridSeries,
    r: BreakoutChainResult & { baselinePct: number | null },
    verdicts: readonly ChainVerdict[],
    view: GridView,
    box: GridBox,
    focusIdx: number | null = null,
): DrawLayer[] {
    const n = s.times.length;
    if (n === 0 || box.width <= 0 || box.height <= 0 || view.x1 <= view.x0) return [];
    const { bw, cx, first, last } = xScaleOf(view, box, n);
    const y = (pct: number): number => box.top + ((view.hi - pct) / (view.hi - view.lo)) * box.height;
    const right = box.left + box.width;
    const clipX = (x: number): number => Math.min(right, Math.max(box.left, x));

    // ── 사슬 띠 — 시작~끝 직전(살아 있으면 하루 끝). 기준선 합류 뒤는 기준선 색. 상자 밖은 자른다.
    const chainOps: DrawOp[] = [];
    const chainBaseOps: DrawOp[] = [];
    const band = (a: number, b: number, into: DrawOp[], fill: string): void => {
        const x1 = clipX(cx(a) - bw / 2);
        const x2 = clipX(cx(b) + bw / 2);
        if (x2 > x1) into.push({ op: "rect", x: x1, y: box.top, w: x2 - x1, h: box.height, fill });
    };
    for (const c of r.chains) {
        const end = (c.end ?? n) - 1; // 끝 봉은 사슬 밖
        if (end < first || c.start > last) continue;
        const split = c.baselineFrom ?? end + 1;
        if (split > c.start) band(c.start, split - 1, chainOps, BREAKOUT_HIGH);
        if (split <= end) band(split, end, chainBaseOps, BREAKOUT_BASE);
    }

    // ── 캔들 — 거래 없는 봉(채움봉)은 안 그린다(사건이 아니듯 그림도 아니다).
    const candleOps: DrawOp[] = [];
    const bodyW = Math.max(1, bw * 0.7);
    for (let i = first; i <= last; i++) {
        if (!(tvAt(s, i) > 0)) continue;
        const o = s.minuteOpen[i];
        const c = s.rate[i];
        const col = c >= o ? RISE : FALL;
        candleOps.push({ op: "line", x1: cx(i), y1: y(s.minuteHigh[i]), x2: cx(i), y2: y(s.minuteLow[i]), stroke: col, width: 1 });
        const top = y(Math.max(o, c));
        candleOps.push({ op: "rect", x: cx(i) - bodyW / 2, y: top, w: bodyW, h: Math.max(1, y(Math.min(o, c)) - top), fill: col });
    }

    // ── 계단선 — null(밴드 없음·소멸) 구간은 끊는다.
    const steps = (vals: readonly (number | null)[], stroke: string, dash?: string): DrawOp[] => {
        const ops: DrawOp[] = [];
        let pts: number[] = [];
        const flush = (): void => {
            if (pts.length >= 4) ops.push({ op: "polyline", pts, stroke, width: 1.2, ...(dash ? { dash } : {}) });
            pts = [];
        };
        for (let i = first; i <= last; i++) {
            const v = vals[i];
            if (v === null || v === undefined) { flush(); continue; }
            pts.push(clipX(cx(i) - bw / 2), y(v), clipX(cx(i) + bw / 2), y(v));
        }
        flush();
        return ops;
    };
    const t = r.trace;
    const bandOps = t ? [...steps(t.top, BREAKOUT_HIGH), ...steps(t.bottom, BREAKOUT_HIGH, "3 3")] : [];
    const baseOps: DrawOp[] = [];
    if (r.baselinePct !== null && r.baselinePct >= view.lo && r.baselinePct <= view.hi) {
        baseOps.push({ op: "line", x1: box.left, y1: y(r.baselinePct), x2: right, y2: y(r.baselinePct), stroke: BREAKOUT_BASE, width: 1.2 });
        baseOps.push({ op: "text", x: right - 2, y: y(r.baselinePct) - 3, text: "기준선", anchor: "end", fill: BREAKOUT_BASE, size: 10 });
    }
    if (t) baseOps.push(...steps(t.baseBottom, BREAKOUT_BASE, "2 3"));

    // ── 후보 ▼(최종 통과) · ▽(봉 조건 통과·순번 밖). 색 = 그 봉의 이름표.
    const markOps: DrawOp[] = [];
    const dimOps: DrawOp[] = [];
    for (const v of verdicts) {
        const i = v.bar.i;
        if (i < first || i > last || v.rank === null) continue;
        (v.picked ? markOps : dimOps).push({
            op: "text", x: cx(i), y: y(s.minuteHigh[i]) - 3, text: v.picked ? "▼" : "▽", anchor: "middle",
            fill: labelColor(v.bar.label), size: 11, halo: HALO,
        });
    }

    const focusOps: DrawOp[] = [];
    if (focusIdx !== null && focusIdx >= first && focusIdx <= last) {
        focusOps.push({ op: "line", x1: cx(focusIdx), y1: box.top, x2: cx(focusIdx), y2: box.top + box.height, stroke: MARKER_NOW, width: 1, dash: "2 2" });
    }

    // ── 눈금 — 값은 위·아래 끝, 시각은 바닥(보이는 폭에 맞춘 간격).
    const axisOps: DrawOp[] = [
        { op: "text", x: box.left + 2, y: box.top + 10, text: `${view.hi.toFixed(1)}%`, anchor: "start", fill: AXIS_TEXT, size: 10, halo: HALO },
        { op: "text", x: box.left + 2, y: box.top + box.height - 3, text: `${view.lo.toFixed(1)}%`, anchor: "start", fill: AXIS_TEXT, size: 10, halo: HALO },
    ];
    const step = tickStepOf(bw);
    for (let i = first; i <= last; i++) {
        const m = minuteOfDayOf(s.times[i]);
        if (m % step !== 0) continue;
        const x = cx(i);
        if (x < box.left + 40 || x > right - 16) continue; // 값 눈금과 안 겹치게
        const hm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        axisOps.push({ op: "text", x, y: box.top + box.height - 3, text: hm, anchor: "middle", fill: AXIS_TEXT, size: 9.5, halo: HALO });
    }

    return [
        { name: "chains", groups: compact([{ opacity: 0.1, ops: chainOps }, { opacity: 0.12, ops: chainBaseOps }]) },
        { name: "candles", groups: compact([{ ops: candleOps }]) },
        { name: "bands", groups: compact([{ opacity: 0.9, ops: bandOps }]) },
        { name: "baseline", groups: compact([{ ops: baseOps }]) },
        { name: "marks", groups: compact([{ opacity: 0.45, ops: dimOps }, { ops: markOps }]) },
        { name: "focus", groups: compact([{ ops: focusOps }]) },
        { name: "axis", groups: compact([{ ops: axisOps }]) },
    ].filter((l) => l.groups.length > 0);
}

/** 레인을 그릴 수 있는 최소 봉 폭(px) — 이보다 좁으면 칸이 뭉개져 오히려 거짓말을 한다. */
export const LANE_MIN_BW = 6;
export const LANE_ROW_H = 11;

/**
 * 사슬 필터 레인 — 봉 조건 한 줄 = 레인 한 줄(통과 초록·탈락 빨강), 맨 아래 「순번」 줄(최종 후보 = 이름표 색,
 * 통과했지만 순번 밖 = 흐림). 사슬 밖 봉은 빈칸. 봉 폭이 `LANE_MIN_BW` 미만이면 빈 목록(부른 쪽이 안내한다).
 */
export function laneLayers(
    verdicts: readonly ChainVerdict[],
    checks: readonly ChainCheck[],
    span: GridSpan,
    box: GridBox,
    n: number,
): DrawLayer[] {
    const xs = xScaleOf(span, box, n);
    if (xs.bw < LANE_MIN_BW || box.width <= 0) return [];
    const rows = checks.length + 1;
    const rh = box.height / rows;
    const w = Math.max(2, xs.bw * 0.8);
    const pass: DrawOp[] = [];
    const fail: DrawOp[] = [];
    const picked: DrawOp[] = [];
    const ranked: DrawOp[] = [];
    const nums: DrawOp[] = [];
    for (const v of verdicts) {
        const i = v.bar.i;
        if (i < xs.first || i > xs.last) continue;
        const x = xs.cx(i) - w / 2;
        checks.forEach((c, r) => {
            (v.failed.includes(c) ? fail : pass).push({ op: "rect", x, y: box.top + r * rh + 1, w, h: rh - 2, fill: v.failed.includes(c) ? CHAIN_FAIL : CHAIN_PASS });
        });
        if (v.rank !== null) {
            const y0 = box.top + checks.length * rh + 1;
            (v.picked ? picked : ranked).push({ op: "rect", x, y: y0, w, h: rh - 2, fill: labelColor(v.bar.label) });
            if (xs.bw >= 14) {
                nums.push({ op: "text", x: xs.cx(i), y: y0 + rh - 4, text: String(v.rank + 1), anchor: "middle", fill: "var(--bg-primary)", size: 8.5, weight: 600 });
            }
        }
    }
    const names: DrawOp[] = [...checks.map((c) => CHECK_NAME[c]), "순번"].map((t, r) => ({
        op: "text", x: box.left + 2, y: box.top + r * rh + rh - 3, text: t, anchor: "start", fill: "var(--text-secondary)", size: 9, halo: HALO,
    }));
    return [
        { name: "lanes", groups: compact([{ opacity: 0.55, ops: pass }, { opacity: 0.55, ops: fail }, { opacity: 0.3, ops: ranked }, { ops: picked }]) },
        { name: "lane-text", groups: compact([{ ops: nums }, { ops: names }]) },
    ].filter((l) => l.groups.length > 0);
}

/**
 * 하루 길잡이 띠 — 하루 전체(x = 0..n)에 종가 선·사슬 띠·후보 눈금, 그 위에 보는 창 사각형.
 */
export function navLayers(
    s: GridSeries,
    r: BreakoutChainResult,
    verdicts: readonly ChainVerdict[],
    span: GridSpan,
    box: GridBox,
): DrawLayer[] {
    const n = s.times.length;
    if (n === 0 || box.width <= 0) return [];
    const whole = xScaleOf({ x0: 0, x1: n }, box, n);
    const range = viewRangeOf(s, 0, n - 1, null);
    const chainOps: DrawOp[] = [];
    for (const c of r.chains) {
        const end = (c.end ?? n) - 1;
        const x1 = whole.cx(c.start) - whole.bw / 2;
        chainOps.push({ op: "rect", x: x1, y: box.top, w: Math.max(1, whole.cx(end) + whole.bw / 2 - x1), h: box.height, fill: BREAKOUT_HIGH });
    }
    const lineOps: DrawOp[] = [];
    if (range) {
        const y = (p: number): number => box.top + 2 + ((range.hi - p) / (range.hi - range.lo)) * (box.height - 4);
        const pts: number[] = [];
        for (let i = 0; i < n; i++) if (tvAt(s, i) > 0) pts.push(whole.cx(i), y(s.rate[i]));
        if (pts.length >= 4) lineOps.push({ op: "polyline", pts, stroke: "var(--text-secondary)", width: 1 });
    }
    const tickOps: DrawOp[] = [];
    for (const v of verdicts) {
        if (!v.picked) continue;
        const x = whole.cx(v.bar.i);
        tickOps.push({ op: "line", x1: x, y1: box.top + box.height - 4, x2: x, y2: box.top + box.height, stroke: labelColor(v.bar.label), width: 1 });
    }
    const vx1 = Math.max(box.left, whole.cx(span.x0) - whole.bw / 2);
    const vx2 = Math.min(box.left + box.width, whole.cx(span.x1) - whole.bw / 2);
    const winOps: DrawOp[] = [
        { op: "rect", x: vx1, y: box.top, w: Math.max(2, vx2 - vx1), h: box.height, fill: "var(--accent-primary)" },
    ];
    const frameOps: DrawOp[] = [
        { op: "polyline", pts: [vx1, box.top + 0.5, vx2, box.top + 0.5, vx2, box.top + box.height - 0.5, vx1, box.top + box.height - 0.5, vx1, box.top + 0.5], stroke: "var(--accent-primary)", width: 1 },
    ];
    return [
        { name: "nav-chains", groups: compact([{ opacity: 0.12, ops: chainOps }]) },
        { name: "nav-line", groups: compact([{ ops: lineOps }, { ops: tickOps }]) },
        { name: "nav-window", groups: compact([{ opacity: 0.12, ops: winOps }, { ops: frameOps }]) },
    ].filter((l) => l.groups.length > 0);
}
