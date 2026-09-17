// 테마 순위 평면의 공용 뷰모델 — 조건판(ThemeRankPanel)·관찰판(ThemeScopePanel)이 나눠 쓰는
// **판정 무관** 층 전부: 시선·전역 시각·스냅샷·단면·좌표(planeSliceAt)·동료/렌즈/색·뷰 도메인
// (서수 zoom·값 vdom)·스케일·꼬리·캔버스 레이어·집기(nearestAt)·이동(navigate)·브레드크럼 앵커.
//
// 판정(컷·존·✓/✗·카운트·재적 띠)은 여기 없다 — 조건판 전용이고, 종류 분리가 "관찰판에서 판정이
// 조용히 도는" 경로를 코드 구조로 막는 게 설계다(decisions.md 「테마 순위는 판이 둘이다」).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../../store/workbench.js";
import { useSubject } from "../../lib/subject.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useChartPoints } from "../../lib/useChartPoints.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import {
    AMOUNT_VIEW, RANK_VIEW_SPAN, RATE_VIEW,
    planeSliceAt, rankScaleX, rankScaleY, valueScaleX, valueScaleY,
    type AxisScale, type ThemeRankAxes, type ValueDom,
} from "./axisModel.js";
import { defaultMinuteOf, scrubSectionOf, type ScrubSection } from "./scrubSection.js";
import { scatterLayer } from "./scatterLayer.js";
import { themeColorMap } from "./themeColor.js";
import { trailLayer, type Trail, type TrailPoint } from "./trailLayer.js";
import { ACTIVE } from "../../styles/palette.js";

// 오른쪽 여백이 넓은 이유: 등락(가로선) 손잡이 배지가 **오른쪽 스케일**에 가로로 앉기 때문이다
// (2026-09-17 저녁 — x반전으로 주 시선(상위권)이 오른쪽-위가 되자 왼쪽 배지는 손과 눈이 반대편이었다.
// 등락 눈금은 양쪽에 선다).
export const PAD = { left: 44, top: 16, right: 64, bottom: 30 };
/** 그림 안쪽 패딩(px) — 도메인 끝(1위 코너)의 점·링이 경계에 딱 붙지 않게 **스케일만** 이만큼 안으로
 * 매핑한다(경계선·클립·배지 자리는 바깥 상자 그대로 — 2026-09-17 사용자 피드백). */
export const INNER_PAD = 12;
/** 컷/자 라벨 배지 크기(px) — 이게 손잡이다(선 자체는 안 잡힌다). */
export const LBL_W = 52;
export const LBL_H = 14;
export const LBL_PAD = 3;
/** 점 집기 반경(px) — 호버 툴팁과 클릭 이동이 같이 쓴다. */
export const HIT_R = 8;
/** 이만큼 넘게 끌렸으면 클릭이 아니다(px). */
export const CLICK_SLOP = 4;
/** 줌 하한(서수 폭) — 이보다 좁히면 몇 위 안 남아 좌표가 무의미해진다. */
export const ZOOM_MIN_SPAN = 4;

export const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** 분 → focus.time 포맷("HH:MM:00") — Taskbar TimeControl 과 같은 자. */
export const fmtHms = (m: number): string => `${fmtMin(m)}:00`;

/** 서수 뷰 도메인(세션) — 날짜에 매인다(유니버스 크기가 날짜마다 달라 같은 사각이 다른 영역이 된다). */
export interface ZoomDom { date: string; x0: number; x1: number; y0: number; y1: number }

export interface PlanePoint {
    code: string;
    rate: number;
    amount: number;
}

export interface ThemePlane {
    panelId: string;
    axes: ThemeRankAxes;
    subject: ReturnType<typeof useSubject>;
    focusTime: string | null;
    originId: string;
    snapStatus: "idle" | "loading" | "error" | "ready";
    snapError: string | null;
    minute: number | null;
    minuteRange: { lo: number; hi: number } | null;
    section: ScrubSection | null;
    stocks: ReturnType<typeof useDaySnapshot>["data"] extends infer D ? (D extends { stocks: infer S } ? S | undefined : undefined) : never;
    participants: PlanePoint[];
    hitPoints: PlanePoint[];
    subjectThemes: readonly string[];
    peerThemes: ReadonlyMap<string, readonly string[]>;
    themeColors: ReadonlyMap<string, string>;
    themesStatus: "ready" | "loading" | "error";
    lens: string | null;
    setLens: (t: string | null) => void;
    maxRank: number;
    dom: { x0: number; x1: number; y0: number; y1: number };
    domSpan: number;
    defaultSpan: number;
    clampDom0: (v: number, span: number) => number;
    vx: ValueDom;
    vy: ValueDom;
    rawVdom: { x?: ValueDom; y?: ValueDom } | undefined;
    zoom: ZoomDom | null;
    zoomable: boolean;
    viewMoved: boolean;
    resetView: () => void;
    writeZoom: (d: { x0: number; x1: number; y0: number; y1: number }) => void;
    writeVdom: (d: { x?: ValueDom; y?: ValueDom }) => void;
    xScale: AxisScale;
    yScale: AxisScale;
    scales: { x: (v: number) => number; y: (v: number) => number };
    foldedRate: number;
    size: { w: number; h: number };
    box: { left: number; top: number; width: number; height: number };
    /** 스케일이 쓰는 안쪽 상자(INNER_PAD) — 팬·휠의 px→도메인 비율도 이걸 써야 1:1 로 따라온다. */
    inner: { left: number; top: number; width: number; height: number };
    wrapRef: (el: HTMLDivElement | null) => void;
    trails: Trail[] | null;
    layers: ReturnType<typeof scatterLayer>[];
    trailMinutes: number[];
    pointMinutes: number[];
    nearestAt: (x: number, y: number) => PlanePoint | null;
    navigate: (code: string) => void;
    anchor: { code: string; date: string; time: string | null } | null;
    goBack: () => void;
}

export function useThemePlane(panelId: string, axes: ThemeRankAxes): ThemePlane {
    const subject = useSubject();
    const setCode = useWorkbench((s) => s.setCode);
    const setFocus = useWorkbench((s) => s.setFocus);
    const focusTime = useWorkbench((s) => s.focus.time);
    const lastFocusOrigin = useWorkbench((s) => s.lastFocusOrigin);
    const setSessionUi = useWorkbench((s) => s.setSessionUi);
    const originId = useId(); // 시선 변경 출처 태그 — 브레드크럼이 "내가 옮긴 것"만 기억하게 한다

    // ── 그날 스냅샷(복기 파생) — 정규화 패널과 같은 공용 LRU 캐시.
    const snapQ = useDaySnapshot(subject?.date ?? null);
    const stocks = snapQ.data?.stocks;

    // 슬라이더 도메인 — 스냅샷의 실제 분 범위.
    const minuteRange = useMemo(() => {
        if (!stocks || stocks.length === 0) return null;
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of stocks) {
            if (s.times.length === 0) continue;
            const a = minuteOfDayOf(s.times[0]);
            const b = minuteOfDayOf(s.times[s.times.length - 1]);
            if (a < lo) lo = a;
            if (b > hi) hi = b;
        }
        return Number.isFinite(lo) ? { lo, hi } : null;
    }, [stocks]);

    // ── 표시 분 = 전역 시각 직결(2026-09-09) — 없으면 기본 사다리(첫 타점 → 마지막 봉).
    const chartPoints = useChartPoints(subject?.code ?? "", subject?.date ?? "");
    const minute = useMemo(() => {
        if (!subject) return null;
        const m = defaultMinuteOf(focusTime, chartPoints, minuteRange?.hi ?? null);
        // 표시 클램프만 — 전역 focus.time 은 되쓰지 않는다(패널이 전역을 정정하면 루프 모양).
        if (m === null || !minuteRange) return m;
        return Math.min(Math.max(m, minuteRange.lo), minuteRange.hi);
    }, [subject, focusTime, chartPoints, minuteRange]);

    // ── 단면 — 분 단위 memo(파라미터 무관 — 드래그가 단면을 재굽지 않게).
    const section: ScrubSection | null = useMemo(() => {
        if (!stocks || stocks.length === 0 || !subject || minute === null) return null;
        return scrubSectionOf(stocks, subject.date, fmtMin(minute));
    }, [stocks, subject, minute]);

    // ── 테마 동료/렌즈/색 — 시선-파생 memo 의존성은 subject 객체가 아니라 **원시값**(스크럽 틱마다
    // 동료 맵·색이 재계산되지 않게 — 기존 불변식).
    const themesView = useThemeIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const subjectThemes = useMemo(() => (subject ? themesView.index.themesOf(subject.code) : []), [themesView.index, subject?.code]);
    const rawLens = useWorkbench((s) => s.sessionUi[panelId]?.["lens"]) as string | undefined;
    const lens = rawLens !== undefined && subjectThemes.includes(rawLens) ? rawLens : null;
    const setLens = useCallback((t: string | null): void => setSessionUi(panelId, "lens", t ?? undefined), [panelId, setSessionUi]);
    const peerThemes = useMemo(() => {
        const out = new Map<string, string[]>();
        if (!subject) return out;
        for (const t of subjectThemes)
            for (const c of themesView.index.codesOf(t)) {
                if (c === subject.code) continue;
                const list = out.get(c);
                if (list) list.push(t);
                else out.set(c, [t]);
            }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themesView.index, subject?.code, subjectThemes]);
    const themeColors = useMemo(() => themeColorMap(subjectThemes), [subjectThemes]);
    const themesStatus = themesView.error ? "error" : themesView.ready ? "ready" : "loading";

    // ── 그림 상자 — 안정 콜백 ref(기존 불변식: 인라인이면 detach/attach 루프).
    const [size, setSize] = useState({ w: 0, h: 0 });
    const roRef = useRef<ResizeObserver | null>(null);
    const wrapRef = useCallback((el: HTMLDivElement | null): void => {
        roRef.current?.disconnect();
        roRef.current = null;
        if (!el) return;
        const ro = new ResizeObserver((es) => {
            const w = es[0].contentRect.width;
            const h = es[0].contentRect.height;
            setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        });
        ro.observe(el);
        roRef.current = ro;
    }, []);
    useEffect(() => () => roRef.current?.disconnect(), []);
    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };
    // 스케일이 실제로 쓰는 안쪽 상자 — 점·눈금·컷이 전부 이만큼 들어와 도메인 끝이 숨을 쉰다.
    const inner = { left: box.left + INNER_PAD, top: box.top + INNER_PAD, width: Math.max(0, box.width - 2 * INNER_PAD), height: Math.max(0, box.height - 2 * INNER_PAD) };

    // 축 상한 = 유니버스 크기 — 하루 안에서 상수(carry-forward 로 n 이 자라도 축이 안 출렁이게).
    const maxRank = Math.max(section?.codes.length ?? 0, 1);

    // ── 서수 뷰 도메인 — 기본 [1..200] 고정 창(2026-09-17). 팬 상시, 휠 줌은 서수×서수에서만.
    // 도메인 읽기는 **서수 축이 하나라도 있으면** 산다 — 혼합 축(예: x 순위 · y 값)에서 x 팬이 쓰는
    // zoom 을 "둘 다 순위" 게이트로 버리면 팬이 조용히 죽고, 저장물만 남아 모드 복귀 때 뷰가 튄다.
    const zoomable = axes.xMode === "rank" && axes.yMode === "rank";
    const anyRank = axes.xMode === "rank" || axes.yMode === "rank";
    const rawZoom = useWorkbench((s) => s.sessionUi[panelId]?.["zoom"]) as ZoomDom | undefined;
    const zoom = anyRank && rawZoom !== undefined && subject !== null && rawZoom.date === subject.date ? rawZoom : null;
    const defaultSpan = Math.max(Math.min(RANK_VIEW_SPAN, maxRank) - 1, 1);
    const dom = useMemo(() => zoom ?? { x0: 1, x1: 1 + defaultSpan, y0: 1, y1: 1 + defaultSpan }, [zoom, defaultSpan]);
    const domSpan = Math.max(dom.x1 - dom.x0, 1);
    const clampDom0 = useCallback(
        (v: number, span: number): number => Math.max(1, Math.min(v, Math.max(maxRank - span, 1))),
        [maxRank],
    );
    // ── 값 축 뷰 도메인(팬) — 세션 수명, 날짜 무관. 기본 창은 axisModel 상수.
    const rawVdom = useWorkbench((s) => s.sessionUi[panelId]?.["vdom"]) as { x?: ValueDom; y?: ValueDom } | undefined;
    const vx = rawVdom?.x ?? AMOUNT_VIEW;
    const vy = rawVdom?.y ?? RATE_VIEW;
    const viewMoved = zoom !== null || rawVdom !== undefined;
    const resetView = useCallback((): void => {
        setSessionUi(panelId, "zoom", undefined);
        setSessionUi(panelId, "vdom", undefined);
    }, [panelId, setSessionUi]);
    const writeZoom = useCallback(
        (d: { x0: number; x1: number; y0: number; y1: number }): void => {
            if (subject) setSessionUi(panelId, "zoom", { date: subject.date, ...d });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [panelId, subject?.date, setSessionUi],
    );
    const writeVdom = useCallback((d: { x?: ValueDom; y?: ValueDom }): void => setSessionUi(panelId, "vdom", d), [panelId, setSessionUi]);

    // ── 평면 단면 — 축 설정이 정한 좌표(서수/값·창). 계산 주체는 core 한 벌(sectionSeries 캐시 경유).
    const slice = useMemo(
        () => (stocks && subject && minute !== null ? planeSliceAt(stocks, subject.date, minute, axes) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stocks, subject?.date, minute, axes],
    );
    const participants = useMemo(() => {
        if (!section || !slice) return [];
        const out: PlanePoint[] = [];
        for (let i = 0; i < section.codes.length; i++) {
            const x = slice.x[i];
            const y = slice.y[i];
            if (x === null || y === null) continue;
            // 등락 값 축의 기본 창 아래는 **접는다**(그리지도 집히지도 않음) — 클램프로 바닥에 눕히면
            // 접힘 배지와 같은 점을 이중으로 말한다. 보는 길은 팬(하한 −30).
            if (axes.yMode === "value" && y < vy.lo) continue;
            out.push({ code: section.codes[i], rate: y, amount: x });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section, slice, axes.yMode, axes.yMode === "value" ? vy.lo : 0]);
    // 집기 대상 = 그려진 것뿐(시선 + 동료) — 안 그린 점에 툴팁이 뜨면 유령을 짚는 셈이다.
    const hitPoints = useMemo(
        () => participants.filter((p) => p.code === subject?.code || peerThemes.has(p.code)),
        [participants, peerThemes, subject],
    );

    // ── 축 스케일 — 서수는 뷰 도메인, 값은 고정 도메인(+팬 vdom). 렌더·판정·드래그의 단일 출처.
    const xScale = useMemo(
        () => (axes.xMode === "rank" ? rankScaleX(dom, inner, maxRank, axes.windowMin) : valueScaleX(vx, inner, axes.windowMin)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [axes, dom, vx, inner.left, inner.top, inner.width, inner.height, maxRank],
    );
    const yScale = useMemo(
        () => (axes.yMode === "rank" ? rankScaleY(dom, inner, maxRank) : valueScaleY(vy, inner)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [axes, dom, vy, inner.left, inner.top, inner.width, inner.height, maxRank],
    );
    const scales = useMemo(() => ({ x: xScale.px, y: yScale.px }), [xScale, yScale]);
    // 접힌 등락 값의 수 — participants 가 창 아래를 이미 걸러내므로(위) 원본 slice 에서 센다.
    // 배지의 모수 = 그려질 자격이 있던 것(시선+동료)뿐 — 유니버스 전체를 세면 숫자가 뜻을 잃는다.
    const foldedRate = useMemo(() => {
        if (axes.yMode !== "value" || !section || !slice || !subject) return 0;
        let n = 0;
        for (let i = 0; i < section.codes.length; i++) {
            const y = slice.y[i];
            if (y === null || y >= vy.lo) continue;
            const code = section.codes[i];
            if (code === subject.code || peerThemes.has(code)) n++;
        }
        return n;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [axes.yMode, section, slice, subject?.code, peerThemes, axes.yMode === "value" ? vy.lo : 0]);

    // ── 꼬리 — 상대 오프셋(전역 영속 설정). 꼭짓점도 현재 축 설정의 좌표다.
    const trailOffsets = useWorkbench((s) => s.themeTrailOffsets);
    const trailMinutes = useMemo(() => {
        if (minute === null || !minuteRange || trailOffsets.length === 0) return [];
        return trailOffsets.map((o) => minute - o).filter((m) => m >= minuteRange.lo).sort((a, b) => a - b);
    }, [trailOffsets, minute, minuteRange]);
    const trails = useMemo((): Trail[] | null => {
        if (trailMinutes.length === 0 || !stocks || !subject || !section) return null;
        const slices = trailMinutes.map((m) => planeSliceAt(stocks, subject.date, m, axes));
        const peers: Trail[] = [];
        let subjTrail: Trail | null = null;
        for (const p of hitPoints) {
            const isSubj = p.code === subject.code;
            const themes = peerThemes.get(p.code);
            const idx = section.indexOf(p.code);
            const pts: (TrailPoint | null)[] = slices.map((s) => {
                if (idx === null) return null;
                const x = s.x[idx];
                const y = s.y[idx];
                return x !== null && y !== null ? { rate: y, amount: x } : null;
            });
            pts.push({ rate: p.rate, amount: p.amount }); // 머리 = 지금 분(산점의 점과 같은 자리)
            const t: Trail = {
                color: isSubj ? ACTIVE : themeColors.get(themes?.[0] ?? "") ?? ACTIVE,
                dim: !isSubj && lens !== null && !(themes ?? []).includes(lens),
                pts,
            };
            if (isSubj) subjTrail = t;
            else peers.push(t);
        }
        if (subjTrail) peers.push(subjTrail); // 시선 꼬리가 맨 위
        return peers;
    }, [trailMinutes, stocks, subject, section, hitPoints, peerThemes, themeColors, lens, axes]);

    const layers = useMemo(() => {
        const scatter = scatterLayer({ points: participants, subject: subject?.code ?? null, peerThemes, colorOf: themeColors, lens, scales, compact: trails !== null });
        return trails !== null ? [trailLayer({ trails, scales }), scatter] : [scatter];
    }, [participants, subject, peerThemes, themeColors, lens, scales, trails]);

    // 타점의 분들 — ▼ 마커(클릭 = 점프).
    const pointMinutes = useMemo(
        () => chartPoints.map((t) => {
            const [h, m] = t.split(":");
            return Number(h) * 60 + Number(m);
        }),
        [chartPoints],
    );

    /** 그 자리에서 가장 가까운 점(HIT_R 안) — 뷰 밖(클립된) 점은 제외(가장자리 유령 클릭 방지). */
    const nearestAt = (x: number, y: number): PlanePoint | null => {
        let best: PlanePoint | null = null;
        let bestD = HIT_R * HIT_R;
        for (const p of hitPoints) {
            const px = scales.x(p.amount);
            const py = scales.y(p.rate);
            if (px < box.left || px > box.left + box.width || py < box.top || py > box.top + box.height) continue;
            const dx = px - x;
            const dy = py - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = p; }
        }
        return best;
    };

    // ── 되돌아가기 앵커 — 이 패널에서 점을 눌러 떠나기 전 시선(세션 수명, 읽기 시점 파생).
    const rawAnchor = useWorkbench((s) => s.sessionUi[panelId]?.["origin"]) as { code: string; date: string; time: string | null } | undefined;
    const anchor = rawAnchor !== undefined && subject && rawAnchor.code !== subject.code ? rawAnchor : null;
    const prevCode = useRef(subject?.code ?? null);
    useEffect(() => {
        const c = subject?.code ?? null;
        if (prevCode.current === c) return;
        prevCode.current = c;
        // 남이 시선을 옮겼으면 앵커는 유령이다 — 종목이 실제로 바뀐 순간에만 지운다(마운트에선 안 지움).
        if (lastFocusOrigin !== originId) setSessionUi(panelId, "origin", undefined);
    }, [subject?.code, lastFocusOrigin, originId, setSessionUi, panelId]);

    /** 점 클릭 = 그 종목으로 이동(동료만). 하루 선택이면 표시 중이던 기본 분을 실체화해서 간다. */
    const navigate = (code: string): void => {
        if (!subject || code === subject.code || !peerThemes.has(code)) return;
        if (!anchor) setSessionUi(panelId, "origin", { code: subject.code, date: subject.date, time: focusTime });
        if (focusTime === null && minute !== null) setFocus({ date: subject.date, code, time: fmtHms(minute) }, originId);
        else setCode(code, originId);
    };
    const goBack = (): void => {
        if (anchor) setFocus({ date: anchor.date, code: anchor.code, time: anchor.time }, originId);
    };

    const snapStatus: ThemePlane["snapStatus"] = !subject ? "idle" : snapQ.isError ? "error" : snapQ.isLoading ? "loading" : "ready";

    return {
        panelId, axes, subject, focusTime, originId,
        snapStatus, snapError: snapQ.isError ? (snapQ.error as Error).message : null,
        minute, minuteRange, section, stocks,
        participants, hitPoints, subjectThemes, peerThemes, themeColors, themesStatus, lens, setLens,
        maxRank, dom, domSpan, defaultSpan, clampDom0, vx, vy, rawVdom, zoom, zoomable, viewMoved, resetView, writeZoom, writeVdom,
        xScale, yScale, scales, foldedRate, size, box, inner, wrapRef,
        trails, layers, trailMinutes, pointMinutes, nearestAt, navigate, anchor, goBack,
    };
}
