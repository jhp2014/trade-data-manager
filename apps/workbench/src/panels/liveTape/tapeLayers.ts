// 테이프 그림의 **표시목록 빌더** — 순수(같은 입력 = 같은 목록). 골격 패널의 drawList 계약을 그대로 쓴다.
//
// 층 순서(먼저가 아래): 회색띠(기계 결손) → 격자·축 → 멤버 선 → 포커스 선.
//  · 회색띠가 맨 아래 — 결손 위를 지나는 선이 있으면(백필로 메워진 종목) 선이 이겨야 한다.
//  · 포커스가 맨 위 — 주인공이 무리에 묻히지 않게.
// 멤버 선의 문법은 복기 테마 오버레이와 같다: 무채색, **굵기가 거래대금**(runWidth 램프),
// 포커스만 플레인 색. 빈 분은 선이 끊긴 채로 둔다(tapeData.segmentsOf — 결손은 정보).
import { amountRuns, LEVEL_MISSING } from "../skeleton/skeletonOverlay.js";
import { amountLevelOf, runWidth } from "../skeleton/amountLayer.js";
import { flatten, compact, type DrawGroup, type DrawLayer, type DrawOp } from "../skeleton/drawList.js";
import { segmentsOf, type TapePoint } from "./tapeData.js";
import type { LiveTapeStock } from "@trade-data-manager/wire";

const MEMBER_STROKE = "var(--text-tertiary)";
const FOCUS_STROKE = "var(--plane-live)";
const BAND_FILL = "var(--bg-tertiary)";
const GRID_STROKE = "var(--border-subtle)";
const AXIS_TEXT = "var(--text-tertiary)";

export interface Scales {
    x: (minute: number) => number;
    y: (rate: number) => number;
}

/** 분당 거래대금 — 누적 차분(복기 minuteAmountOf 와 같은 정의, 소스만 테이프). 빠진 분은 null(모름). */
export function tapeAmountAt(stock: LiveTapeStock): (minute: number) => number | null {
    const idx = new Map<number, number>();
    for (let i = 0; i < stock.minutes.length; i++) idx.set(stock.minutes[i], i);
    return (m) => {
        const i = idx.get(m);
        if (i == null) return null;
        // 직전 분이 결손이면 차분이 "여러 분의 합"이 된다 — 그 값은 그 분의 것이 아니라 모름으로 둔다.
        if (i > 0 && stock.minutes[i - 1] !== m - 1) return null;
        const v = stock.cumAmount[i] - (i > 0 ? stock.cumAmount[i - 1] : 0);
        return Number.isFinite(v) && v >= 0 ? v : null;
    };
}

/** 기계 결손 회색띠 — [from, to] 분 구간들을 상자 높이로. */
export function bandsLayer(gaps: ReadonlyArray<{ from: number; to: number }>, s: Scales, box: { top: number; height: number }): DrawLayer {
    const ops: DrawOp[] = gaps.map((g) => ({
        op: "rect",
        x: s.x(g.from),
        y: box.top,
        w: Math.max(1, s.x(g.to + 1) - s.x(g.from)),
        h: box.height,
        fill: BAND_FILL,
    }));
    return { name: "tape-bands", groups: compact([{ opacity: 0.6, ops }]) };
}

/** 격자 + 축 라벨 — y 는 % 정수 눈금, x 는 시각(30분). 상자 밖 라벨은 호출자가 여백으로 확보한다. */
export function gridLayer(
    s: Scales,
    view: { fromMinute: number; toMinute: number; minRate: number; maxRate: number },
    box: { left: number; top: number; width: number; height: number },
): DrawLayer {
    const ops: DrawOp[] = [];
    // y 눈금 — 5~8개가 되는 정수 간격(1·2·5·10 …)
    const span = Math.max(view.maxRate - view.minRate, 0.1);
    const rawStep = span / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((v) => v >= rawStep) ?? 10 * mag;
    for (let r = Math.ceil(view.minRate / step) * step; r <= view.maxRate + 1e-9; r += step) {
        const y = s.y(r);
        ops.push({ op: "line", x1: box.left, y1: y, x2: box.left + box.width, y2: y, stroke: GRID_STROKE, width: 1 });
        ops.push({ op: "text", x: box.left + 4, y: y - 3, text: `${Math.round(r * 10) / 10}%`, anchor: "start", fill: AXIS_TEXT, size: 10 });
    }
    // 0% 기준선은 진하게(등락의 축)
    if (view.minRate <= 0 && view.maxRate >= 0)
        ops.push({ op: "line", x1: box.left, y1: s.y(0), x2: box.left + box.width, y2: s.y(0), stroke: "var(--border-strong)", width: 1 });
    // x 눈금 — 정시·30분
    for (let m = Math.ceil(view.fromMinute / 30) * 30; m <= view.toMinute; m += 30) {
        const x = s.x(m);
        ops.push({ op: "line", x1: x, y1: box.top, x2: x, y2: box.top + box.height, stroke: GRID_STROKE, width: 1 });
        const hh = String(Math.floor(m / 60)).padStart(2, "0");
        const mm = String(m % 60).padStart(2, "0");
        ops.push({ op: "text", x, y: box.top + box.height - 4, text: `${hh}:${mm}`, anchor: "middle", fill: AXIS_TEXT, size: 10 });
    }
    return { name: "tape-grid", groups: compact([{ ops }]) };
}

export interface TapeLinesParams {
    stocks: readonly LiveTapeStock[];
    focusCode: string;
    hovered: string | null;
    /** 굵기(거래대금 램프)를 켰나 — 껐으면 균일 폭 폴리라인. */
    amountWidthOn: boolean;
    scales: Scales;
}

/** 한 조각을 (런 있으면) 대금 굵기 램프로, 아니면 균일 선으로. 점 하나짜리 조각은 동그라미. */
function segmentOps(seg: TapePoint[], stroke: string, width: number, runsOn: boolean, amountAt: (m: number) => number | null, s: Scales, widthScale: number): DrawOp[] {
    if (seg.length === 1)
        return [{ op: "circle", cx: s.x(seg[0].x), cy: s.y(seg[0].y), r: Math.max(1.2, width), fill: stroke }];
    if (!runsOn) return [{ op: "polyline", pts: flatten(seg, s.x, s.y), stroke, width, join: "round" }];
    // baseT=0 — 테이프의 x 가 곧 벽시계 분이라 평행이동이 없다.
    return amountRuns(seg, 0, amountAt, amountLevelOf).map((run) => ({
        op: "polyline" as const,
        pts: flatten(run.points, s.x, s.y),
        stroke,
        width: runWidth(run.level, widthScale),
        cap: "round" as const,
        join: "round" as const,
        // 재료 없음(결손 직후 차분 불가)은 살짝 옅게 — "조용함"과 "모름"을 굵기(runWidth)와 함께 이중으로 가른다.
        opacity: run.level === LEVEL_MISSING ? 0.6 : 1,
    }));
}

/** 멤버 선들(무채색·대금 굵기) — 포커스 제외. 짚은 선만 또렷. */
export function memberLinesLayer({ stocks, focusCode, hovered, amountWidthOn, scales }: TapeLinesParams): DrawLayer {
    const groups: DrawGroup[] = [];
    for (const st of stocks) {
        if (st.code === focusCode) continue;
        const lit = hovered === st.code;
        const amountAt = tapeAmountAt(st);
        const ops: DrawOp[] = [];
        for (const seg of segmentsOf(st.minutes, st.rate))
            ops.push(...segmentOps(seg, MEMBER_STROKE, lit ? 2 : 1, amountWidthOn, amountAt, scales, lit ? 0.9 : 0.7));
        groups.push({ opacity: lit ? 0.95 : hovered !== null ? 0.25 : 0.55, ops });
    }
    return { name: "tape-members", groups: compact(groups) };
}

/** 포커스 선 — 플레인 색, 맨 위. 굵기 램프도 앵커 배수(멤버보다 굵게). */
export function focusLineLayer({ stocks, focusCode, hovered, amountWidthOn, scales }: TapeLinesParams): DrawLayer {
    const st = stocks.find((x) => x.code === focusCode);
    if (!st) return { name: "tape-focus", groups: [] };
    const amountAt = tapeAmountAt(st);
    const ops: DrawOp[] = [];
    for (const seg of segmentsOf(st.minutes, st.rate))
        ops.push(...segmentOps(seg, FOCUS_STROKE, 2.2, amountWidthOn, amountAt, scales, 1.1));
    return { name: "tape-focus", groups: compact([{ opacity: hovered !== null && hovered !== focusCode ? 0.5 : 1, ops }]) };
}

/** 그리는 순서 — 먼저가 아래(회색띠는 배경, 포커스는 주인공). */
export function tapeLayers(
    gaps: ReadonlyArray<{ from: number; to: number }>,
    view: { fromMinute: number; toMinute: number; minRate: number; maxRate: number },
    box: { left: number; top: number; width: number; height: number },
    params: TapeLinesParams,
): DrawLayer[] {
    return [
        bandsLayer(gaps, params.scales, box),
        gridLayer(params.scales, view, box),
        memberLinesLayer(params),
        focusLineLayer(params),
    ];
}
