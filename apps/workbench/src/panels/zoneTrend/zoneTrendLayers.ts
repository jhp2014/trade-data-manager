// 존 추세 그림의 표시목록 빌더(순수) — drawList 계약. 선 문법의 최근접 선례는 장중 테마 테이프
// (tapeLayers): 무채색 멤버 + 굵기 = 대금(amountRuns·runWidth) + 시선 한 줄 맨 위 + 호버 승격.
//
// 층 순서(먼저가 아래): 격자·축 → 멤버 선 → 승격 선(hover 재그리기) → 시선 선 → 현재 분 세로선.
// 승격을 **별도 층의 재그리기**로 둔 이유(성능 seam): 멤버 ops 는 hover 와 무관하게 (model, scales)
// 에만 매여 memo 되고, hover 는 묶음 껍데기(opacity)와 승격 층 한 줄만 다시 만든다 — 마우스가
// 지나갈 때마다 amountRuns 전량이 다시 돌지 않는다.
import { AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { amountRuns, LEVEL_MISSING } from "../canvas/amountRuns.js";
import { amountLevelOf, runWidth } from "../canvas/amountScale.js";
import { compact, flatten, type DrawGroup, type DrawLayer, type DrawOp } from "../canvas/drawList.js";
import { AMOUNT_BUCKET_COLORS } from "../../chart/chartUtils.js";
import { ACTIVE, BREAKOUT_BASE, BREAKOUT_HIGH } from "../../styles/palette.js";
import type { HoverDetail, ZoneTrendLine, ZoneTrendModel } from "./zoneTrendModel.js";

/** 분·등락 → px. 테이프 Scales 와 같은 모양이지만 좌표계 주인이 달라 따로 선언한다(층 전부가 이걸 본다). */
export interface Scales {
    x: (minute: number) => number;
    y: (rate: number) => number;
}

/** y 창(등락 %) — 고정이 아니다(2026-10-06 개정): 기본 = 자동 맞춤(autoYViewOf), 수동 = 휠·팬. */
export interface YView { lo: number; hi: number }

/** y 수동 조정 한계 — 가격제한폭(±30)보다 관대하게. 실제 클램프는 **Y_PAN ∪ 지금 창**(boundsOf) —
 *  자동 맞춤 창이 한계 밖에서 시작해도(신규상장 급등 등 ±30 밖 등락) 첫 팬/줌에서 창이 안 튄다
 *  (재확인 리뷰 지적). 멀리 날아가는 건 더블클릭 복귀·접힘 배지가 감당한다. */
export const Y_PAN: YView = { lo: -60, hi: 160 };
/** 폭 하한 2%p — 이보다 좁히면 눈금·자리의 뜻이 무너진다. */
export const Y_ZOOM_MIN_SPAN = 2;

/** 조정 한계 = Y_PAN 과 지금 창의 합집합 — 지금 창은 늘 한계 안이라 손짓이 연속이다. */
const boundsOf = (v: YView): YView => ({ lo: Math.min(Y_PAN.lo, v.lo), hi: Math.max(Y_PAN.hi, v.hi) });

/** 휠 줌 — 커서 값 고정 f배(단면 zoomRateDom 과 같은 꼴, 한계만 이 판 것). u = 도메인 내 비율(lo=0). */
export function zoomYView(v: YView, f: number, u: number): YView {
    const b = boundsOf(v);
    const span = v.hi - v.lo;
    const next = Math.min(Math.max(span * f, Y_ZOOM_MIN_SPAN), b.hi - b.lo);
    if (next === span) return v;
    const lo = Math.max(b.lo, Math.min(v.lo + u * span - u * next, b.hi - next));
    return { lo, hi: lo + next };
}

/** 팬 — 폭 유지한 채 한계 안에서 미끄러진다. */
export function panYView(v: YView, dv: number): YView {
    const b = boundsOf(v);
    const span = v.hi - v.lo;
    const lo = Math.max(b.lo, Math.min(v.lo + dv, b.hi - span));
    return lo === v.lo ? v : { lo, hi: lo + span };
}

const MEMBER_STROKE = "var(--text-tertiary)";
const LIFT_STROKE = "var(--text-primary)";

export interface TrendBox { left: number; top: number; width: number; height: number }

/**
 * 격자·축 글자 — 테이프 gridLayer 를 재사용하지 않고 자체 배치: 거긴 위 눈금 글자가 선 **위**(y−3)에
 * 서서 최상단 글자가 clip 밖으로 나가고, 왼쪽 아래에서 y·x 글자가 겹친다(리뷰 지적).
 * y 창이 동적(자동 맞춤·수동)이라 눈금은 1/2/5 스텝 — 상단 가장자리에 붙은 글자만 선 아래로 내린다.
 */
export function trendGridLayer(s: Scales, view: { fromMinute: number; toMinute: number }, y: YView, box: TrendBox): DrawLayer {
    const ops: DrawOp[] = [];
    // y 눈금 — 4~6개가 되는 1/2/5 스텝(테이프와 같은 셈).
    const span = Math.max(y.hi - y.lo, 0.1);
    const rough = span / 5;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((v) => v >= rough) ?? 10 * mag;
    for (let r = Math.ceil(y.lo / step) * step; r <= y.hi + 1e-9; r += step) {
        const py = s.y(r);
        ops.push({ op: "line", x1: box.left, y1: py, x2: box.left + box.width, y2: py, stroke: "var(--border-subtle)", width: 1 });
        const label = `${Math.round(r * 10) / 10}%`;
        // 상단 가장자리 글자는 선 아래(+10) — 위(−3)면 clip 에 잘린다.
        ops.push({ op: "text", x: box.left + 4, y: py + (py < box.top + 12 ? 10 : -3), text: label, anchor: "start", fill: "var(--text-tertiary)", size: 10 });
    }
    // 0% 기준선은 진하게(등락의 축) — 창 안일 때만.
    if (y.lo <= 0 && y.hi >= 0)
        ops.push({ op: "line", x1: box.left, y1: s.y(0), x2: box.left + box.width, y2: s.y(0), stroke: "var(--border-strong)", width: 1 });
    // x 눈금 — 창 폭에 맞춘 동적 스텝(5~8개). 정시 고정이면 이른 시각(창이 수십 분)엔 눈금이 0개가
    // 된다(2026-10-06 저녁 사용자 지적 — x 창이 "시작~현재 분 +10"이라 폭이 시각을 따라 자란다).
    const xSpan = Math.max(view.toMinute - view.fromMinute, 1);
    const xStep = [5, 10, 15, 30, 60, 120].find((v) => xSpan / v <= 8) ?? 240;
    for (let m = Math.ceil(view.fromMinute / xStep) * xStep; m <= view.toMinute; m += xStep) {
        const x = s.x(m);
        ops.push({ op: "line", x1: x, y1: box.top, x2: x, y2: box.top + box.height, stroke: "var(--border-subtle)", width: 1 });
        // 가장자리 글자 생략 — 왼쪽은 y 글자(…%)와, 오른쪽은 clip 경계와 겹친다(가운데 정렬 반폭).
        if (x >= box.left + 28 && x <= box.left + box.width - 18)
            ops.push({ op: "text", x, y: box.top + box.height - 4, text: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, anchor: "middle", fill: "var(--text-tertiary)", size: 10 });
    }
    return { name: "trend-grid", groups: compact([{ ops }]) };
}

/** 선 하나 → ops(대금 굵기 램프). 점 하나짜리 선은 동그라미(테이프 segmentOps 와 같은 규칙). */
function lineOps(line: ZoneTrendLine, stroke: string, widthScale: number, s: Scales): DrawOp[] {
    if (line.pts.length === 0) return [];
    if (line.pts.length === 1)
        return [{ op: "circle", cx: s.x(line.pts[0].x), cy: s.y(line.pts[0].y), r: 1.6, fill: stroke }];
    // baseT=0 — x 가 곧 벽시계 분(테이프와 같은 좌표).
    return amountRuns(line.pts, 0, line.amountAt, amountLevelOf).map((run) => ({
        op: "polyline" as const,
        pts: flatten(run.points, s.x, s.y),
        stroke,
        width: runWidth(run.level, widthScale),
        cap: "round" as const,
        join: "round" as const,
        // 재료 없음(결손 직후 차분 불가)은 살짝 옅게 — "조용함"과 "모름"을 굵기와 함께 이중으로 가른다.
        opacity: run.level === LEVEL_MISSING ? 0.6 : 1,
    }));
}

/** 멤버 ops 한 벌 — hover 무관(성능 seam). 호출자는 (model, scales)에 memo 한다. */
export function memberOpsOf(members: readonly ZoneTrendLine[], s: Scales): { code: string; ops: DrawOp[] }[] {
    return members.map((m) => ({ code: m.code, ops: lineOps(m, MEMBER_STROKE, 0.7, s) }));
}

/** 멤버 선들 — 균일 저채도(개체 식별은 hover 몫). 짚는 중엔 나머지가 가라앉는다(테이프 선례 수치). */
export function memberLinesLayer(memberOps: readonly { code: string; ops: DrawOp[] }[], hovered: string | null): DrawLayer {
    const groups: DrawGroup[] = [];
    for (const m of memberOps) {
        if (m.code === hovered) continue; // 짚은 선은 승격 층이 다시 그린다
        groups.push({ opacity: hovered !== null ? 0.25 : 0.55, ops: m.ops });
    }
    return { name: "trend-members", groups: compact(groups) };
}

/**
 * hover 상세 층 — 짚은 선의 분차트를 흐리게 오버레이(2026-10-06 저녁: dense 선 → **캔들** 교체 +
 * 대금 구간 마커 + 밴드·사슬). 묶음을 넷으로 가른 이유 = 투명도가 다르다(사슬 띠 ≪ 밴드 면 ≪ 캔들).
 * 재료(HoverDetail)는 전부 이 판의 y 와 같은 % 공간 — 모델이 보장한다.
 */
export function hoverLayer(detail: HoverDetail | null, s: Scales, box: TrendBox): DrawLayer {
    if (detail === null) return { name: "trend-hover", groups: [] };
    const minuteW = Math.max(s.x(1) - s.x(0), 0.5); // 선형 x — 1분의 px 폭
    const bodyW = Math.min(Math.max(minuteW * 0.7, 1), 9);

    const chainOps: DrawOp[] = detail.chains.map((c) => ({
        op: "rect", x: s.x(c.from) - minuteW / 2, y: box.top,
        w: Math.max(s.x(c.to) - s.x(c.from) + minuteW, minuteW), h: box.height, fill: BREAKOUT_HIGH,
    }));
    const bandOps: DrawOp[] = [];
    for (const b of detail.bands)
        for (const p of b.pts)
            bandOps.push({
                op: "rect", x: s.x(p.x) - minuteW / 2, y: s.y(p.hi),
                w: minuteW, h: Math.max(s.y(p.lo) - s.y(p.hi), 0.5),
                fill: b.kind === "high" ? BREAKOUT_HIGH : BREAKOUT_BASE,
            });
    const candleOps: DrawOp[] = [];
    for (const c of detail.candles) {
        const x = s.x(c.x);
        const color = c.c >= c.o ? "var(--rise)" : "var(--fall)";
        candleOps.push({ op: "line", x1: x, y1: s.y(c.h), x2: x, y2: s.y(c.l), stroke: color, width: 1 });
        const yTop = s.y(Math.max(c.o, c.c));
        candleOps.push({ op: "rect", x: x - bodyW / 2, y: yTop, w: bodyW, h: Math.max(s.y(Math.min(c.o, c.c)) - yTop, 1), fill: color });
    }
    // 대금 마커 — 기본 차트 분봉과 같은 어휘(봉 위 구간 하한 숫자·버킷 색). halo 로 캔들 위에서도 읽힌다.
    const amountOps: DrawOp[] = detail.amounts.map((a) => ({
        op: "text", x: s.x(a.x), y: s.y(a.h) - 3, text: String(AMOUNT_BUCKETS_EOK[a.bucket]),
        anchor: "middle", fill: AMOUNT_BUCKET_COLORS[a.bucket] ?? AMOUNT_BUCKET_COLORS[AMOUNT_BUCKET_COLORS.length - 1],
        size: 9, weight: 600, halo: { color: "var(--bg-primary)", width: 3 },
    }));
    return {
        name: "trend-hover",
        groups: compact([
            { opacity: 0.07, ops: chainOps },
            { opacity: 0.16, ops: bandOps },
            { opacity: 0.8, ops: candleOps },
            { opacity: 0.95, ops: amountOps },
        ]),
    };
}

/** 승격 층 — 짚은 멤버 한 줄만 진하게·조금 굵게 재그리기(시선 선은 승격 불요 — 이미 제 색이 주인공). */
export function liftLayer(members: readonly ZoneTrendLine[], hovered: string | null, s: Scales): DrawLayer {
    const line = hovered !== null ? members.find((m) => m.code === hovered) : undefined;
    const groups: DrawGroup[] = line ? [{ opacity: 0.95, ops: lineOps(line, LIFT_STROKE, 0.9, s) }] : [];
    return { name: "trend-lift", groups: compact(groups) };
}

/** 시선 선 — ACTIVE 하늘색, 맨 위. 남을 짚는 중엔 반투명(테이프 포커스 선례). */
export function subjectLineLayer(subject: ZoneTrendLine | null, hovered: string | null, s: Scales): DrawLayer {
    const groups: DrawGroup[] = subject
        ? [{ opacity: hovered !== null && hovered !== subject.code ? 0.5 : 1, ops: lineOps(subject, ACTIVE, 1.1, s) }]
        : [];
    return { name: "trend-subject", groups: compact(groups) };
}

/** 현재 분 세로선 — 선의 오른쪽 끝이 곧 현재 분이라는 사실을 축에도 적는다. */
export function nowLayer(minute: number, s: Scales, box: TrendBox): DrawLayer {
    const x = s.x(minute);
    return {
        name: "trend-now",
        groups: [{ opacity: 0.7, ops: [{ op: "line", x1: x, y1: box.top, x2: x, y2: box.top + box.height, stroke: "var(--border-strong)", width: 1, dash: "3 3" }] }],
    };
}

/**
 * 접힘 수 — **현재 머리(마지막 꼭짓점)**가 y 창 밖인 선(시선 포함). 위 = 상한가 쪽(흔하다 — 존 멤버),
 * 아래 = 음수 등락(시선이 멤버가 아닐 때 흔하다) — 하늘색 선이 말없이 사라지면 반증이 없다(리뷰 지적).
 */
export function foldedCounts(model: ZoneTrendModel, view: YView): { above: number; below: number } {
    let above = 0;
    let below = 0;
    const headY = (l: ZoneTrendLine): number | null => (l.pts.length > 0 ? l.pts[l.pts.length - 1].y : null);
    const lines = model.subject !== null ? [model.subject, ...model.members] : model.members;
    for (const l of lines) {
        const y = headY(l);
        if (y === null) continue;
        if (y > view.hi) above++;
        else if (y < view.lo) below++;
    }
    return { above, below };
}

/** 그리는 순서 — 먼저가 아래. */
export function zoneTrendLayers(args: {
    model: ZoneTrendModel;
    memberOps: readonly { code: string; ops: DrawOp[] }[];
    hovered: string | null;
    /** 짚은 선의 분차트 상세 — 승격 지그재그 **위**에 얹힌다(승격 선은 캔들 아래 남아 짚기 앵커가 된다
     *  — 짚기 판정은 지그재그 선분 거리라, 선이 사라지면 캔들 위에서 hover 가 깜빡인다. 리뷰 지적). */
    hoverDetail: HoverDetail | null;
    minute: number;
    view: { fromMinute: number; toMinute: number };
    yView: YView;
    box: TrendBox;
    scales: Scales;
}): DrawLayer[] {
    const { model, memberOps, hovered, hoverDetail, minute, view, yView, box, scales } = args;
    return [
        trendGridLayer(scales, view, yView, box),
        memberLinesLayer(memberOps, hovered),
        liftLayer(model.members, hovered, scales),
        hoverLayer(hoverDetail, scales, box),
        subjectLineLayer(model.subject, hovered, scales),
        nowLayer(minute, scales, box),
    ];
}

/** 집기 반경(px) — 선분 거리 기준. */
export const LINE_HIT_R = 8;

/** (px,py)에서 가장 가까운 선 — 꼭짓점 폴리라인과의 선분 거리. 상자 밖 포인터는 안 집는다(유령 집기 방지). */
export function nearestLine(
    px: number,
    py: number,
    lines: readonly ZoneTrendLine[],
    s: Scales,
    box: TrendBox,
    r: number = LINE_HIT_R,
): string | null {
    if (px < box.left || px > box.left + box.width || py < box.top || py > box.top + box.height) return null;
    let best: string | null = null;
    let bestD = r * r;
    for (const line of lines) {
        const pts = line.pts;
        if (pts.length === 0) continue;
        if (pts.length === 1) {
            const dx = s.x(pts[0].x) - px;
            const dy = s.y(pts[0].y) - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = line.code; }
            continue;
        }
        for (let i = 0; i + 1 < pts.length; i++) {
            const x1 = s.x(pts[i].x);
            const y1 = s.y(pts[i].y);
            const x2 = s.x(pts[i + 1].x);
            const y2 = s.y(pts[i + 1].y);
            const vx = x2 - x1;
            const vy = y2 - y1;
            const len2 = vx * vx + vy * vy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len2)) : 0;
            const dx = x1 + t * vx - px;
            const dy = y1 + t * vy - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = line.code; }
        }
    }
    return best;
}
