// 존 추세 그림의 표시목록 빌더(순수) — drawList 계약. 선 문법의 최근접 선례는 장중 테마 테이프
// (tapeLayers): 무채색 멤버 + 굵기 = 대금(amountRuns·runWidth) + 시선 한 줄 맨 위 + 호버 승격.
//
// 층 순서(먼저가 아래): 격자·축 → 멤버 선 → 승격 선(hover 재그리기) → 시선 선 → 현재 분 세로선.
// 승격을 **별도 층의 재그리기**로 둔 이유(성능 seam): 멤버 ops 는 hover 와 무관하게 (model, scales)
// 에만 매여 memo 되고, hover 는 묶음 껍데기(opacity)와 승격 층 한 줄만 다시 만든다 — 마우스가
// 지나갈 때마다 amountRuns 전량이 다시 돌지 않는다.
import { amountRuns, LEVEL_MISSING } from "../canvas/amountRuns.js";
import { amountLevelOf, runWidth } from "../canvas/amountScale.js";
import { compact, flatten, type DrawGroup, type DrawLayer, type DrawOp } from "../canvas/drawList.js";
import { ACTIVE } from "../../styles/palette.js";
import type { ZoneTrendLine, ZoneTrendModel } from "./zoneTrendModel.js";

/** 분·등락 → px. 테이프 Scales 와 같은 모양이지만 좌표계 주인이 달라 따로 선언한다(층 전부가 이걸 본다). */
export interface Scales {
    x: (minute: number) => number;
    y: (rate: number) => number;
}

/** y 고정 창(등락 %) — 공통 척도(칸·날짜 건너 같은 픽셀 = 같은 기울기). 단면 RATE_VIEW(0~31)와
 *  뜻이 다르다(여긴 추세 창·위로 나간 선은 클립 + 접힘 배지) — 공유하지 않는다. */
export const ZONE_TREND_RATE = { lo: 0, hi: 15 };

const MEMBER_STROKE = "var(--text-tertiary)";
const LIFT_STROKE = "var(--text-primary)";

export interface TrendBox { left: number; top: number; width: number; height: number }

/**
 * 격자·축 글자 — 테이프 gridLayer 를 재사용하지 않고 자체 배치: 거긴 위 눈금 글자가 선 **위**(y−3)에
 * 서서 최상단(+15%) 글자가 clip 밖으로 나가고, 왼쪽 아래에서 y·x 글자가 겹친다(리뷰 지적).
 * 여긴 y 창이 고정(0~15%)이라 눈금도 고정 0·5·10·15 — 최상단 글자만 선 아래로 내린다.
 */
export function trendGridLayer(s: Scales, view: { fromMinute: number; toMinute: number }, box: TrendBox): DrawLayer {
    const ops: DrawOp[] = [];
    const { lo, hi } = ZONE_TREND_RATE;
    for (let r = lo; r <= hi; r += 5) {
        const y = s.y(r);
        ops.push({ op: "line", x1: box.left, y1: y, x2: box.left + box.width, y2: y, stroke: "var(--border-subtle)", width: 1 });
        // 최상단(hi) 글자는 선 아래(+10) — 위(−3)면 clip 에 잘린다. 0% 기준선은 진하게(등락의 축).
        ops.push({ op: "text", x: box.left + 4, y: y + (r === hi ? 10 : -3), text: `${r}%`, anchor: "start", fill: "var(--text-tertiary)", size: 10 });
    }
    ops.push({ op: "line", x1: box.left, y1: s.y(lo), x2: box.left + box.width, y2: s.y(lo), stroke: "var(--border-strong)", width: 1 });
    // x 눈금 — 정시만(추세 창은 하루 전체라 30분은 과밀). 왼쪽 가장자리 글자는 y 글자(…%)와 겹쳐 생략.
    for (let m = Math.ceil(view.fromMinute / 60) * 60; m <= view.toMinute; m += 60) {
        const x = s.x(m);
        ops.push({ op: "line", x1: x, y1: box.top, x2: x, y2: box.top + box.height, stroke: "var(--border-subtle)", width: 1 });
        if (x >= box.left + 34)
            ops.push({ op: "text", x, y: box.top + box.height - 4, text: `${String(Math.floor(m / 60)).padStart(2, "0")}:00`, anchor: "middle", fill: "var(--text-tertiary)", size: 10 });
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
export function foldedCounts(model: ZoneTrendModel, view: { lo: number; hi: number }): { above: number; below: number } {
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
    minute: number;
    view: { fromMinute: number; toMinute: number };
    box: TrendBox;
    scales: Scales;
}): DrawLayer[] {
    const { model, memberOps, hovered, minute, view, box, scales } = args;
    return [
        trendGridLayer(scales, view, box),
        memberLinesLayer(memberOps, hovered),
        liftLayer(model.members, hovered, scales),
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
