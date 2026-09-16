// 테마 순위 평면의 축 어댑터(순수) — 서수/값 스케일·고정 도메인·팬 한계·눈금·라벨을 한 곳에.
//
// 2026-09-17 화면 규칙(decisions.md 테마 강도 절):
//  · 순위 축은 **1위 = 오른쪽/위**다(x 반전 — 값 모드의 "큰 값 = 오른쪽"과 일관, y 는 원래 일관).
//    존 틴트는 오른쪽-위 사각이 된다.
//  · 순위 기본 도메인 = [1..RANK_VIEW_SPAN(200)] 고정(유니버스가 작으면 그만큼) — 존 사각 크기가
//    유니버스 크기 따라 달라 보이지 않게, 날짜 건너 같은 픽셀 = 같은 순위 차. 밖은 드래그 팬.
//  · 값 축 도메인 고정(데이터 추종 폐지 — 스크럽마다 축이 출렁이지 않게): 대금 1억~1조(로그) ·
//    등락 0~+31%(선형). 기본 창 밖은 팬(등락 하한 −30 · 대금 로그 [1e6, 1e13]). 기본 창 아래로
//    떨어진 점은 가장자리 접힘 배지(개수)가 말한다 — foldedBelowCount.
//
// 두 판(조건판·관찰판)이 이 자 하나를 같이 본다 — 도메인 상수의 집은 여기다(패널이 아니라).
import { formatAxisValue } from "../../lib/computedAxis.js";
import type { ReplayStock } from "../../api/dayReplay.js";
import { sectionAtMinute, valuesAtMinute, windowedAmountsAt, windowedRanksAt } from "./sectionSeries.js";

export type AxisMode = "rank" | "value";

export interface ThemeRankAxes {
    /** 가로 = 누적 거래대금 축의 모드. */
    xMode: AxisMode;
    /** 세로 = 등락률 축의 모드. */
    yMode: AxisMode;
    /** 대금 창(분). null = 당일 전체. 순위/값 모드 공통으로 대금 축에 적용된다(관찰판은 임의 분). */
    windowMin: number | null;
}

export const DEFAULT_AXES: ThemeRankAxes = { xMode: "rank", yMode: "rank", windowMin: null };

/** 창 프리셋(분) — 관찰판 "축 ▾"의 빠른 선택지. 입력칸이 본론이고 이건 지름길일 뿐이다. */
export const WINDOW_CHOICES: readonly (number | null)[] = [null, 120, 60, 30, 10];

/** 관대한 병합 — 필드 증설이 옛 저장물을 죽이지 않게(themeStrength 파서와 같은 결). */
export function parseThemeRankAxes(raw: unknown): ThemeRankAxes {
    const o = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const mode = (v: unknown): AxisMode => (v === "value" ? "value" : "rank");
    const w = o.windowMin;
    return {
        xMode: mode(o.xMode),
        yMode: mode(o.yMode),
        windowMin: typeof w === "number" && Number.isFinite(w) && w > 0 ? Math.round(w) : null,
    };
}

export const windowLabel = (windowMin: number | null): string => (windowMin === null ? "당일" : `${windowMin}분`);

// ── 고정 도메인 상수 ────────────────────────────────────────────────────────────
export interface ValueDom {
    lo: number;
    hi: number;
}

/** 순위 기본 창(위) — 상수, 노브 없음(2026-09-17 사용자 확정). */
export const RANK_VIEW_SPAN = 200;
/** 등락률 값 축: 기본 창 [0, +31]% · 팬 하한 −30(가격제한폭). 0 아래는 접힘 배지가 개수로 말한다. */
export const RATE_VIEW: ValueDom = { lo: 0, hi: 31 };
export const RATE_PAN_LO = -30;
/** 대금 값 축(로그): 기본 창 1억~1조 · 팬 한계 [1e6, 1e13]. */
export const AMOUNT_VIEW: ValueDom = { lo: 1e8, hi: 1e12 };
export const AMOUNT_PAN: ValueDom = { lo: 1e6, hi: 1e13 };

/** 기본 창 아래로 떨어진(그려지지 않는) 값의 수 — ≤lo 접힘 배지의 재료. */
export const foldedBelowCount = (values: readonly number[], lo: number): number => {
    let n = 0;
    for (const v of values) if (v < lo) n++;
    return n;
};

/** 등락 값 축 팬 — 창 폭(31)을 유지한 채 [RATE_PAN_LO, RATE_VIEW.hi] 안에서 미끄러진다. */
export function panRateDom(dom: ValueDom, dv: number): ValueDom {
    const span = dom.hi - dom.lo;
    const lo = Math.max(RATE_PAN_LO, Math.min(dom.lo + dv, RATE_VIEW.hi - span));
    return { lo, hi: lo + span };
}

/** 대금 값 축 팬 — 로그 공간에서 미끄러진다(dlog = 데케이드 단위). */
export function panAmountDom(dom: ValueDom, dlog: number): ValueDom {
    const span = Math.log10(dom.hi) - Math.log10(dom.lo);
    const lo = Math.max(Math.log10(AMOUNT_PAN.lo), Math.min(Math.log10(dom.lo) + dlog, Math.log10(AMOUNT_PAN.hi) - span));
    return { lo: 10 ** lo, hi: 10 ** (lo + span) };
}

// ── 평면 단면 — (분, 축 설정) → stocks 순서의 좌표 배열. 재료는 전부 sectionSeries 공용 캐시. ──
export interface PlaneSlice {
    x: (number | null)[];
    y: (number | null)[];
}

export function planeSliceAt(stocks: readonly ReplayStock[], date: string, minute: number, axes: ThemeRankAxes): PlaneSlice {
    const x =
        axes.xMode === "rank"
            ? axes.windowMin === null
                ? sectionAtMinute(stocks, date, minute).amount
                : windowedRanksAt(stocks, date, minute, axes.windowMin)
            : axes.windowMin === null
                ? valuesAtMinute(stocks, date, minute).cumAmount
                : windowedAmountsAt(stocks, date, minute, axes.windowMin);
    const y = axes.yMode === "rank" ? sectionAtMinute(stocks, date, minute).rate : valuesAtMinute(stocks, date, minute).rate;
    return { x, y };
}

// ── 축 스케일 — px/invert/눈금/포맷/제목을 한 물건으로(판 렌더는 이 계약만 본다). ────────────
export interface AxisTick {
    v: number;
    label: string;
}

export interface AxisScale {
    px(v: number): number;
    invert(px: number): number;
    /** 값이 현재 도메인 안인가 — 컷/자의 "밖이면 접는다" 판정용. px 로 재면 안 된다:
     *  값 스케일의 px 는 클램프라 밖의 값도 상자 안 픽셀을 돌려줘, 자리와 안 맞는 라벨이 선다. */
    inDomain(v: number): boolean;
    ticks: AxisTick[];
    /** 툴팁·배지의 짧은 이름("대금"·"60분 대금"·"등락"). */
    chip: string;
    /** 축 제목. */
    title: string;
    fmt(v: number): string;
}

export interface PlotBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

const fmtRank = (v: number): string => `${Math.round(v)}위`;
/** 대금(원) 표기 — 억 단위로 접는 기존 단위 규칙(formatAxisValue)을 그대로 쓴다(1조부터 "4.3조"). */
const fmtWon = (v: number): string => formatAxisValue(v / 1e8, { suffix: "억", decimals: v < 1e9 ? 1 : 0, signed: false });
const fmtRate = (v: number): string => formatAxisValue(v, { suffix: "%", decimals: 1, signed: true });

/** 서수 축(가로) — **1위 = 오른쪽**(2026-09-17 반전). dom 은 뷰 도메인(기본 = 200 창). */
export function rankScaleX(dom: { x0: number; x1: number }, box: PlotBox, maxRank: number, windowMin: number | null): AxisScale {
    const span = Math.max(dom.x1 - dom.x0, 1);
    return {
        px: (ord) => box.left + ((dom.x1 - Math.min(ord, maxRank)) / span) * box.width,
        invert: (px) => Math.max(1, Math.min(maxRank, Math.round(dom.x1 - ((px - box.left) / Math.max(box.width, 1)) * span))),
        inDomain: (v) => v >= dom.x0 && v <= dom.x1,
        ticks: rankTicks(dom.x0, dom.x1, maxRank),
        chip: windowMin === null ? "대금" : `${windowLabel(windowMin)} 대금`,
        title: windowMin === null ? "거래대금 순위 (1위 →)" : `${windowLabel(windowMin)} 대금 순위 (1위 →)`,
        fmt: fmtRank,
    };
}

/** 서수 축(세로) — 1위 = 위(원래 일관). */
export function rankScaleY(dom: { y0: number; y1: number }, box: PlotBox, maxRank: number): AxisScale {
    const span = Math.max(dom.y1 - dom.y0, 1);
    return {
        px: (ord) => box.top + ((Math.min(ord, maxRank) - dom.y0) / span) * box.height,
        invert: (py) => Math.max(1, Math.min(maxRank, Math.round(dom.y0 + ((py - box.top) / Math.max(box.height, 1)) * span))),
        inDomain: (v) => v >= dom.y0 && v <= dom.y1,
        ticks: rankTicks(dom.y0, dom.y1, maxRank),
        chip: "등락",
        title: "등락률 순위 (1위 ↑)",
        fmt: fmtRank,
    };
}

/** 도메인 구간 눈금 — 균등 4~5개(정수 반올림·중복 제거). */
function rankTicks(a: number, b: number, maxRank: number): AxisTick[] {
    return [...new Set([a, a + (b - a) * 0.25, a + (b - a) * 0.5, a + (b - a) * 0.75, b].map(Math.round))]
        .filter((t) => t >= 1 && t <= maxRank)
        .map((v) => ({ v, label: String(v) }));
}

/** 값 축(가로 = 대금, 로그) — 큰 값 = 오른쪽. dom = 뷰 도메인(기본 AMOUNT_VIEW, 팬으로 이동). */
export function valueScaleX(dom: ValueDom, box: PlotBox, windowMin: number | null): AxisScale {
    const l0 = Math.log10(dom.lo);
    const l1 = Math.log10(dom.hi);
    const px = (v: number): number => box.left + ((Math.log10(Math.max(v, dom.lo)) - l0) / Math.max(l1 - l0, 1e-9)) * box.width;
    return {
        px,
        invert: (x) => 10 ** (l0 + ((x - box.left) / Math.max(box.width, 1)) * (l1 - l0)),
        // px 클램프와 같은 경계 — 하한 lo(px 가 거기서부터 자리를 속인다), 상한 hi.
        inDomain: (v) => v >= dom.lo && v <= dom.hi,
        ticks: logTicks(dom.lo, dom.hi).map((v) => ({ v, label: fmtWon(v) })),
        chip: windowMin === null ? "대금" : `${windowLabel(windowMin)} 대금`,
        title: windowMin === null ? "누적 대금(억, 로그) →" : `${windowLabel(windowMin)} 대금(억, 로그) →`,
        fmt: fmtWon,
    };
}

/** 값 축(세로 = 등락률, 선형) — 큰 값 = 위. dom = 뷰 도메인(기본 RATE_VIEW, 팬 하한 −30). */
export function valueScaleY(dom: ValueDom, box: PlotBox): AxisScale {
    const { lo, hi } = dom;
    return {
        px: (v) => box.top + ((hi - Math.min(Math.max(v, lo), hi)) / Math.max(hi - lo, 1e-9)) * box.height,
        invert: (py) => hi - ((py - box.top) / Math.max(box.height, 1)) * (hi - lo),
        inDomain: (v) => v >= lo && v <= hi,
        ticks: linearTicks(lo, hi).map((v) => ({ v, label: fmtRate(v) })),
        chip: "등락",
        title: "등락률 % ↑",
        fmt: fmtRate,
    };
}

/** 로그 눈금 — 1-2-5 계열 중 [lo, hi] 안의 것(넘치면 데케이드만). */
function logTicks(lo: number, hi: number): number[] {
    const out: number[] = [];
    const d0 = Math.floor(Math.log10(Math.max(lo, 1)));
    const d1 = Math.ceil(Math.log10(Math.max(hi, lo * 10)));
    for (let d = d0; d <= d1; d++)
        for (const m of [1, 2, 5]) {
            const v = m * 10 ** d;
            if (v >= lo && v <= hi) out.push(v);
        }
    return out.length > 7 ? out.filter((v) => { const l = Math.log10(v); return Math.abs(l - Math.round(l)) < 1e-9; }) : out;
}

// ── 임시 호환(판 이원화 커밋에서 은퇴) — 옛 단일 패널의 판정 공간/줌 가능 판정. ─────────────
export function isJudgmentSpace(axes: ThemeRankAxes, zoneWindow: number | null): boolean {
    return axes.xMode === "rank" && axes.yMode === "rank" && axes.windowMin === zoneWindow;
}
export const isZoomable = (axes: ThemeRankAxes): boolean => axes.xMode === "rank" && axes.yMode === "rank";

/** 선형 눈금 — 1/2/5 스텝으로 4~6개. */
function linearTicks(lo: number, hi: number): number[] {
    const range = Math.max(hi - lo, 1e-9);
    const rough = range / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => range / s <= 6) ?? 10 * mag;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
}
