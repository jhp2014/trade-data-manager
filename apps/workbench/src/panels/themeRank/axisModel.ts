// 테마 순위 패널의 축 어댑터(순수) — 인스턴스별 축 설정 {x, y, 창} 을 좌표·눈금·라벨로 바꾼다.
//
// 같은 패널 타입이 설정만 바꿔 "당일 대금 순위 평면"도 "60분 대금 순위"도 "등락률×대금 값 산점"도
// 된다(2026-09-16 확정 — 별도 패널 기각, 산점·렌즈·꼬리 기계 한 벌). 두 공간의 차이:
//  · 순위: 유계 서수 선형, 1 = 강함 = **왼쪽/위**(원점 근처). 줌(정사각 도메인)이 성립한다.
//  · 값: 등락률 = 선형 %(위 = 큼), 대금 = **로그**(수십 배 스팬 — 오른쪽 = 큼). 줌은 1차에서 끈다
//    (ZoomDom 이 서수 정사각 불변을 전제 — 값 공간은 축별 스팬이 달라 그 불변이 깨진다).
//
// 판정 층(존 컷선·틴트·✓/✗·카운트)은 **축이 술어가 재는 양과 일치할 때만** 선다(decisions.md 테마
// 강도 절) — 술어의 존은 "당일 전체 대금 서수 × 등락 서수" 위에 정의된 물건이라, 다른 축에서 살리면
// 점의 자리와 판정 숫자가 조용히 갈린다.
import { formatAxisValue } from "../../lib/computedAxis.js";
import type { ReplayStock } from "../../api/dayReplay.js";
import { sectionAtMinute, valuesAtMinute, windowedAmountsAt, windowedRanksAt } from "./sectionSeries.js";

export type AxisMode = "rank" | "value";

export interface ThemeRankAxes {
    /** 가로 = 누적 거래대금 축의 모드. */
    xMode: AxisMode;
    /** 세로 = 등락률 축의 모드. */
    yMode: AxisMode;
    /** 대금 창(분). null = 당일 전체. 순위/값 모드 공통으로 대금 축에 적용된다. */
    windowMin: number | null;
}

export const DEFAULT_AXES: ThemeRankAxes = { xMode: "rank", yMode: "rank", windowMin: null };

/** 창 선택지(분). null = 당일 전체. 검색(깔때기 술어)이 아는 창은 60분뿐이다 — 표시는 전부 공짜(클라 계산). */
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

/**
 * 판정 층이 설 수 있는 축 설정인가 — 술어(테마 강도)가 재는 공간과 일치하는가.
 * `zoneWindow` = 술어의 존 대금 창(현재는 항상 null(당일) — zoneAmountWindow 도입 시 60 이 온다).
 */
export function isJudgmentSpace(axes: ThemeRankAxes, zoneWindow: number | null): boolean {
    return axes.xMode === "rank" && axes.yMode === "rank" && axes.windowMin === zoneWindow;
}

/** 줌은 서수 정사각 도메인 위에서만 성립한다 — 값 축이 하나라도 있으면 끈다(1차 확정). */
export const isZoomable = (axes: ThemeRankAxes): boolean => axes.xMode === "rank" && axes.yMode === "rank";

// ── 평면 단면 — (분, 축 설정) → stocks 순서의 좌표 배열. 재료는 전부 sectionSeries 공용 캐시.
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

// ── 축 스케일 — px/invert/눈금/포맷/제목을 한 물건으로(판 렌더는 이 계약만 본다).
export interface AxisTick {
    v: number;
    label: string;
}

export interface AxisScale {
    px(v: number): number;
    invert(px: number): number;
    /** 값이 현재 도메인 안인가 — 가이드 자의 "밖이면 접는다" 판정용. px 로 재면 안 된다:
     *  값 스케일의 px 는 클램프라 밖의 값도 상자 안 픽셀을 돌려줘, 자리와 안 맞는 라벨이 선다. */
    inDomain(v: number): boolean;
    ticks: AxisTick[];
    /** 툴팁·배지의 짧은 이름("대금"·"60분 대금"·"등락"). */
    chip: string;
    /** 축 제목(방향 화살표 포함). */
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

/** 서수 축(가로) — 1 = 왼쪽. dom 은 줌 도메인(정사각 불변은 호출측 소유). */
export function rankScaleX(dom: { x0: number; x1: number }, box: PlotBox, maxRank: number, windowMin: number | null): AxisScale {
    const span = Math.max(dom.x1 - dom.x0, 1);
    return {
        px: (ord) => box.left + ((Math.min(ord, maxRank) - dom.x0) / span) * box.width,
        invert: (px) => Math.max(1, Math.min(maxRank, Math.round(dom.x0 + ((px - box.left) / Math.max(box.width, 1)) * span))),
        inDomain: (v) => v >= dom.x0 && v <= dom.x1,
        ticks: rankTicks(dom.x0, dom.x1, maxRank),
        chip: windowMin === null ? "대금" : `${windowLabel(windowMin)} 대금`,
        title: windowMin === null ? "거래대금 순위 →" : `${windowLabel(windowMin)} 대금 순위 →`,
        fmt: fmtRank,
    };
}

/** 서수 축(세로) — 1 = 위. */
export function rankScaleY(dom: { y0: number; y1: number }, box: PlotBox, maxRank: number): AxisScale {
    const span = Math.max(dom.y1 - dom.y0, 1);
    return {
        px: (ord) => box.top + ((Math.min(ord, maxRank) - dom.y0) / span) * box.height,
        invert: (py) => Math.max(1, Math.min(maxRank, Math.round(dom.y0 + ((py - box.top) / Math.max(box.height, 1)) * span))),
        inDomain: (v) => v >= dom.y0 && v <= dom.y1,
        ticks: rankTicks(dom.y0, dom.y1, maxRank),
        chip: "등락",
        title: "등락률 순위 ↓",
        fmt: fmtRank,
    };
}

/** 도메인 구간 눈금 — 균등 4~5개(정수 반올림·중복 제거). 옛 tickListOf 승계. */
function rankTicks(a: number, b: number, maxRank: number): AxisTick[] {
    return [...new Set([a, a + (b - a) * 0.25, a + (b - a) * 0.5, a + (b - a) * 0.75, b].map(Math.round))]
        .filter((t) => t >= 1 && t <= maxRank)
        .map((v) => ({ v, label: String(v) }));
}

/** 값 축(가로 = 대금, 로그) — 큰 값 = 오른쪽. 0·바닥 미만은 왼쪽 끝에 눕는다(0 은 값이다 — 결손 아님). */
export function valueScaleX(values: readonly number[], box: PlotBox, windowMin: number | null): AxisScale {
    const pos = values.filter((v) => v > 0);
    const hiRaw = pos.length > 0 ? Math.max(...pos) : 1e11;
    const loRaw = pos.length > 0 ? Math.min(...pos) : 1e8;
    // 바닥은 데이터 최소와 1천만원 중 큰 쪽 — 극소값 하나가 로그 축을 수십 데케이드로 늘이지 않게.
    const lo = Math.max(Math.min(loRaw, hiRaw / 10), 1e7);
    const la = Math.log10(lo);
    const lb = Math.log10(Math.max(hiRaw, lo * 10));
    const pad = (lb - la) * 0.04;
    const l0 = la - pad;
    const l1 = lb + pad;
    const px = (v: number): number => box.left + ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * box.width;
    return {
        px,
        invert: (x) => 10 ** (l0 + ((x - box.left) / Math.max(box.width, 1)) * (l1 - l0)),
        // px 클램프와 정확히 같은 경계 — 하한은 lo(px 가 거기서부터 자리를 속인다), 상한은 패딩 끝(l1,
        // px 가 클램프 없이 정직한 구간). l0 을 쓰면 (10^l0, lo) 띠에서 자리와 안 맞는 라벨이 선다.
        inDomain: (v) => v >= lo && Math.log10(v) <= l1,
        ticks: logTicks(lo, hiRaw).map((v) => ({ v, label: fmtWon(v) })),
        chip: windowMin === null ? "대금" : `${windowLabel(windowMin)} 대금`,
        title: windowMin === null ? "누적 대금(억, 로그) →" : `${windowLabel(windowMin)} 대금(억, 로그) →`,
        fmt: fmtWon,
    };
}

/** 값 축(세로 = 등락률, 선형) — 큰 값 = 위. */
export function valueScaleY(values: readonly number[], box: PlotBox): AxisScale {
    const hiRaw = values.length > 0 ? Math.max(...values) : 5;
    const loRaw = values.length > 0 ? Math.min(...values) : -5;
    const range = Math.max(hiRaw - loRaw, 0.1);
    const lo = loRaw - range * 0.05;
    const hi = hiRaw + range * 0.05;
    return {
        px: (v) => box.top + ((hi - Math.min(Math.max(v, lo), hi)) / (hi - lo)) * box.height,
        invert: (py) => hi - ((py - box.top) / Math.max(box.height, 1)) * (hi - lo),
        inDomain: (v) => v >= lo && v <= hi,
        ticks: linearTicks(lo, hi).map((v) => ({ v, label: fmtRate(v) })),
        chip: "등락",
        title: "등락률 % ↑",
        fmt: fmtRate,
    };
}

/** 로그 눈금 — 1-2-5 계열 중 [lo, hi] 안의 것(최대 ~7개로 솎는다). */
function logTicks(lo: number, hi: number): number[] {
    const out: number[] = [];
    const d0 = Math.floor(Math.log10(Math.max(lo, 1)));
    const d1 = Math.ceil(Math.log10(Math.max(hi, lo * 10)));
    for (let d = d0; d <= d1; d++)
        for (const m of [1, 2, 5]) {
            const v = m * 10 ** d;
            if (v >= lo && v <= hi) out.push(v);
        }
    // 눈금이 넘치면 데케이드(1×10^d)만 남긴다 — 로그 축에서 제일 안 어지러운 솎기.
    return out.length > 7 ? out.filter((v) => { const l = Math.log10(v); return Math.abs(l - Math.round(l)) < 1e-9; }) : out;
}

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
