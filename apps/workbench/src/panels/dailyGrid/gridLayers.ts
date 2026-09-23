// 격자판 그림의 **표시목록 빌더** — 순수(같은 입력 = 같은 목록). drawList 계약(골격·테이프와 같은 것).
//
// 층 순서(먼저가 아래) — 순서가 뜻이다:
//   사슬 띠 → 캔들 → 러닝 밴드(상단 실선·하단 점선) → 기준선·기준선 밴드 하단 → 후보 ▼
//   · 사슬 띠가 맨 아래 — "이 구간이 한 사슬"이라는 배경이고, 캔들이 그 위에서 읽혀야 한다.
//   · 밴드가 캔들 위 — 봉이 하단에 닿았나(사건)를 선이 캔들을 가로질러 보여 준다.
//   · ▼ 가 맨 위 — 주인공(후보)이 무엇에도 안 덮인다.
// 밴드 궤적은 **봉 처리 뒤의 상태**(breakoutChainsOf trace)라 계단으로 그린다 — 선을 비스듬히 이으면
// 없던 가격이 그려진다.
import type { BreakoutChainResult, BreakoutLabel, BreakoutLabelFilter } from "@trade-data-manager/market/domain";
import { compact, type DrawLayer, type DrawOp } from "../canvas/drawList.js";
import { BREAKOUT_BASE, BREAKOUT_HIGH } from "../../styles/palette.js";

/** 그림 재료 — `/day-replay` 종목(%)의 쓰는 필드. */
export interface GridSeries {
    minuteOpen: readonly number[];
    minuteHigh: readonly number[];
    minuteLow: readonly number[];
    rate: readonly number[];
    cumAmount: readonly number[];
}

export interface GridBox { left: number; top: number; width: number; height: number }

/** 보는 구간(시계열 인덱스, 양 끝 포함)과 그 구간의 값 범위(%). */
export interface GridView { from: number; to: number; lo: number; hi: number }

export const labelColor = (l: BreakoutLabel): string => (l === "baseline" ? BREAKOUT_BASE : BREAKOUT_HIGH);

const RISE = "var(--rise)";
const FALL = "var(--fall)";
const AXIS_TEXT = "var(--text-tertiary)";

/** 구간의 값 범위 — 거래 봉의 고가·저가(+ 보이는 기준선). 비면 null. */
export function viewRangeOf(s: GridSeries, from: number, to: number, baselinePct: number | null): { lo: number; hi: number } | null {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = from; i <= to; i++) {
        const tv = s.cumAmount[i] - (i > 0 ? s.cumAmount[i - 1] : 0);
        if (!(tv > 0)) continue;
        lo = Math.min(lo, s.minuteLow[i]);
        hi = Math.max(hi, s.minuteHigh[i]);
    }
    if (lo === Infinity) return null;
    // 기준선은 가까우면(구간 폭의 절반 안) 함께 보인다 — 멀면 캔들이 납작해진다.
    if (baselinePct !== null && baselinePct > hi && baselinePct - hi < (hi - lo) * 0.5) hi = baselinePct;
    const pad = Math.max((hi - lo) * 0.06, 0.1);
    return { lo: lo - pad, hi: hi + pad };
}

/** `label` = 이름표 거르기 — 걸러진 후보는 ▼ 대신 흐린 ▽ 로 남긴다(구조는 그대로라 사슬·밴드는 안 바뀐다). */
export function gridLayers(
    s: GridSeries,
    r: BreakoutChainResult & { baselinePct: number | null },
    view: GridView,
    box: GridBox,
    label: BreakoutLabelFilter = "all",
): DrawLayer[] {
    const n = view.to - view.from + 1;
    if (n <= 0 || box.width <= 0 || box.height <= 0) return [];
    const bw = box.width / n;
    const cx = (i: number): number => box.left + (i - view.from + 0.5) * bw;
    const y = (pct: number): number => box.top + ((view.hi - pct) / (view.hi - view.lo)) * box.height;
    const inView = (i: number): boolean => i >= view.from && i <= view.to;

    // ── 사슬 띠 — 시작~끝(살아 있으면 구간 끝). 기준선 합류 뒤는 기준선 색.
    const chainOps: DrawOp[] = [];
    const chainBaseOps: DrawOp[] = [];
    for (const c of r.chains) {
        const a = Math.max(c.start, view.from);
        const b = Math.min(c.end ?? view.to, view.to);
        if (b < a) continue;
        // 합류가 보는 구간 뒤면 이 구간은 전부 고가 돌파다 — 자르지 않으면 띠가 상자 밖으로 넘친다.
        const split = c.baselineFrom === null ? b + 1 : Math.min(Math.max(c.baselineFrom, a), b + 1);
        if (split > a) chainOps.push({ op: "rect", x: cx(a) - bw / 2, y: box.top, w: (split - a) * bw, h: box.height, fill: BREAKOUT_HIGH });
        if (split <= b) chainBaseOps.push({ op: "rect", x: cx(split) - bw / 2, y: box.top, w: (b - split + 1) * bw, h: box.height, fill: BREAKOUT_BASE });
    }

    // ── 캔들 — 거래 없는 봉(채움봉)은 안 그린다(사건이 아니듯 그림도 아니다).
    const candleOps: DrawOp[] = [];
    const bodyW = Math.max(1, bw * 0.7);
    for (let i = view.from; i <= view.to; i++) {
        const tv = s.cumAmount[i] - (i > 0 ? s.cumAmount[i - 1] : 0);
        if (!(tv > 0)) continue;
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
        for (let i = view.from; i <= view.to; i++) {
            const v = vals[i];
            if (v === null || v === undefined) { flush(); continue; }
            pts.push(cx(i) - bw / 2, y(v), cx(i) + bw / 2, y(v));
        }
        flush();
        return ops;
    };
    const t = r.trace;
    const bandOps = t ? [...steps(t.top, BREAKOUT_HIGH), ...steps(t.bottom, BREAKOUT_HIGH, "3 3")] : [];
    const baseOps: DrawOp[] = [];
    if (r.baselinePct !== null && r.baselinePct >= view.lo && r.baselinePct <= view.hi) {
        baseOps.push({ op: "line", x1: box.left, y1: y(r.baselinePct), x2: box.left + box.width, y2: y(r.baselinePct), stroke: BREAKOUT_BASE, width: 1.2 });
        baseOps.push({ op: "text", x: box.left + box.width - 2, y: y(r.baselinePct) - 3, text: "기준선", anchor: "end", fill: BREAKOUT_BASE, size: 10 });
    }
    if (t) baseOps.push(...steps(t.baseBottom, BREAKOUT_BASE, "2 3"));

    // ── 후보 ▼ — 첫 사건은 채운 ▼, 연장은 빈 ▽. 색 = 그 봉의 이름표.
    const markOps: DrawOp[] = [];
    for (const c of r.candidates) {
        if (!inView(c.i)) continue;
        const kept = label === "all" || c.label === label;
        markOps.push({
            op: "text", x: cx(c.i), y: y(s.minuteHigh[c.i]) - 3, text: kept && c.seq === 0 ? "▼" : "▽", anchor: "middle",
            fill: kept ? labelColor(c.label) : AXIS_TEXT, size: 11, halo: { color: "var(--bg-primary)", width: 2 },
        });
    }

    // ── 값 눈금 — 위·아래 끝만(판이 좁다).
    const axisOps: DrawOp[] = [
        { op: "text", x: box.left + 2, y: box.top + 10, text: `${view.hi.toFixed(1)}%`, anchor: "start", fill: AXIS_TEXT, size: 10 },
        { op: "text", x: box.left + 2, y: box.top + box.height - 3, text: `${view.lo.toFixed(1)}%`, anchor: "start", fill: AXIS_TEXT, size: 10 },
    ];

    return [
        { name: "chains", groups: compact([{ opacity: 0.1, ops: chainOps }, { opacity: 0.12, ops: chainBaseOps }]) },
        { name: "candles", groups: compact([{ ops: candleOps }]) },
        { name: "bands", groups: compact([{ opacity: 0.9, ops: bandOps }]) },
        { name: "baseline", groups: compact([{ ops: baseOps }]) },
        { name: "marks", groups: compact([{ ops: markOps }]) },
        { name: "axis", groups: compact([{ ops: axisOps }]) },
    ].filter((l) => l.groups.length > 0);
}
