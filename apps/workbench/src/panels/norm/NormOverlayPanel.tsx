// 정규화 겹치기 패널 — 옛 골격 패널의 골조(캔버스 3겹·거터 손잡이·공통 척도·테마·거래대금)에
// 새 데이터 모델(시선 1 + 고정 N 슬롯, chartQuery 벌크, 자동 원점)을 끼운 것.
//
// ## 무엇이 갈렸나(골격 시절 대비)
//  · 모수: 깔때기 구독 → **명시 등록**(시선=focus 자동, 고정=거터 칩 클릭·리셋 없음) — 사용자 확정.
//  · 선: 손 피벗 골격 → **실물 정규화 종가선**(일봉=D−1 종가 원점 / 분봉=타점 시각 원점 %p).
//  · 캔들: 참고용 배경(클릭 토글) → **기본 렌더**(적으면 캔들, 많으면 선 — 자동+수동 토글).
//  · 이름: 그림 안 라벨 → **바닥 원점 스택**(정체·범례·원점 표식) + **오른쪽 거터**(분봉의 값 순위표).
//
// ## 이 파일은 **배선**이다
// 상태 채널은 훅들이 나눠 소유한다 — 데이터(useNormLines)·뷰포트(useOverlayViewport)·
// 조사 대상(useInspection)·표시 토글(useOverlayToggles)·테마(useThemeOverlay)·멤버 캔들(useCandles)·
// 복기 파생(useAmountReadout). 여기 남는 건 그 사이 배선과 표시목록(paintLayers) 조립뿐이다.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { boundsOverlap, lineBox, lineOpacity, dimOpacity, lineVisual, type LineVisual, type OverlayLine } from "./overlay.js";
import { useNormLines } from "./useNormLines.js";
import { useDaySnapshot } from "./useDaySnapshot.js";
import { useCandles, type CandlesView } from "./useCandles.js";
import { AUTO_CANDLE_MAX, useOverlayToggles } from "./useOverlayToggles.js";
import { useOverlayViewport } from "./useOverlayViewport.js";
import { useInspection, candleFocusOf } from "./useInspection.js";
import { useAmountReadout } from "./useAmountReadout.js";
import { OverlayPlot, type XUnit } from "./OverlayPlot.js";
import { OverlayMenus } from "./OverlayMenus.js";
import { OverlayHeader } from "./OverlayHeader.js";
import { OverlayFooter } from "./OverlayFooter.js";
import { useGutter } from "./useGutter.js";
import { ORIGIN_CAP, type OriginItem, type OriginStackProps } from "./OriginStack.js";
import type { GutterCandidate } from "./gutter.js";
import type { GutterHandlers, GutterView } from "./GutterLayer.js";
import { amountLookupOf } from "./amountLayer.js";
import { useThemeOverlay } from "./useThemeOverlay.js";
import { buildLevelRows, type LevelOwner, type LevelRowsView, type NormLevel } from "./LevelsLayer.js";
import type { MarkGroup } from "./AnchorMarksLayer.js";
import { normLinesLayer } from "./linesLayer.js";
import { candleLayer, type CandleSeries } from "./candleLayer.js";
import { themeLinesLayer } from "./themeLinesLayer.js";
import { flatten, orderPaint, type DrawLayer } from "../canvas/drawList.js";
import { useWorkbench } from "../../store/workbench.js";
import { shortDate } from "../../lib/date.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { ACTIVE, HOVER, seriesColor } from "../../styles/palette.js";

/** 꺼져 있어도 **층의 자리는 남긴다** — 순서 규약을 켜고 끔과 무관하게 재려면 빈 층이 서 있어야 한다. */
const EMPTY_CANDLES: DrawLayer = { name: "candles", groups: [] };
const EMPTY_THEME_LINES: DrawLayer = { name: "theme-lines", groups: [] };
const EMPTY_LINES: DrawLayer = { name: "lines", groups: [] };
/**
 * **호버 중** 딴 걸 짚었을 때 나머지가 물러나는 진하기(사용자 확정: "겹쳤을 때 하나에 손을 올리면
 * 나머지가 많이 흐려져야 한다"). 평소의 dim/base(항상 켜진 구분용 흐림)보다 한 단계 더 낮다 —
 * 그래야 "지금 이 순간 뭘 짚고 있나"가 상시 흐림과 겹쳐도 뚜렷하게 갈린다.
 */
const RECEDE_OPACITY = 0.12;
/** 캔들 모드의 같은 값(선보다 면적이 커서 시각적으로 더 진하게 느껴지므로 살짝 더 낮춘다). */
const CANDLE_RECEDE_RATIO = 0.15;
/** 캔들 모드에서 시선이 아닌 항목의 **평소** 진하기 배율(호버와 무관 — 적/청이 공통이라 이 값이 항목을 가른다). */
const CANDLE_OTHER_RATIO = 0.45;

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — "일봉에서 훑고 분봉으로 확인"의 동시 사용 시나리오. */
export function NormOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    const toggles = useOverlayToggles(grain);
    const { mode, dailyMarket, zeroLine, showLevels, showLabels, showAmount, showAmountLabels, showTheme, setShowTheme } = toggles;

    const isDaily = grain === "daily";
    const isPointUnit = !isDaily;
    const xUnit: XUnit = isDaily ? "day" : "min";
    /** 전일 종가선이 켜져 있나 — 기준선과 **따로** 켜지므로 수준선 층의 존재 근거가 둘이다. */
    const zeroOn = !isDaily && zeroLine !== "off";

    // 패널 안 단축키 — **t**(테마). 포인터가 이 패널 안에 있을 때만 듣는다(전역 충돌 방지 — 옛 규칙 그대로).
    const [hoveringPanel, setHoveringPanel] = useState(false);
    useEffect(() => {
        if (isDaily || !hoveringPanel) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            if (e.key.toLowerCase() !== "t") return;
            setShowTheme((v) => !v);
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isDaily, hoveringPanel, setShowTheme]);

    // ── 데이터 절반 — 슬롯 해소·정규화·캔들·수준선 전부 useNormLines.
    const data = useNormLines(grain, dailyMarket, zeroLine);
    const { lines, byKey, subjectKeys, nameOf } = data;

    // 캔들/선 — 자동은 항목 수가 정한다(적으면 캔들 — 사용자 확정: 기본은 캔들).
    const effCandles = mode === "candles" || (mode === "auto" && lines.length > 0 && lines.length <= AUTO_CANDLE_MAX);

    // ── 호버 — 훅 여럿(조사 대상·테마)이 나눠 읽는 채널이라 배선 층(여기)이 소유한다.
    const [hovered, setHovered] = useState<string | null>(null);
    // 호버 유령 가드 — 짚고 있던 선이 목록에서 사라지면 mouseleave 가 영영 안 온다(옛 규칙 그대로).
    useEffect(() => {
        if (hovered !== null && !byKey.has(hovered)) setHovered(null);
    }, [hovered, byKey]);

    // ── 거터 넘침 뱃지가 여는 멤버 목록. 그래프를 만지면(팬·확대) 닫는다.
    const [badge, setBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
    const closeBadge = useCallback(() => setBadge(null), []);

    // 거터는 **분봉 전용**(사용자 확정) — 일봉의 이름·정체는 바닥 원점 스택이 진다.
    // 자리는 데이터가 아니라 **토글**이 정한다 — 값이 도착할 때 폭이 출렁이지 않게.
    const showGutter = !isDaily && showLabels;
    const viewport = useOverlayViewport({ isDaily, gutter: showGutter, onGestureStart: closeBadge });
    const { box, bounds, scales, viewX } = viewport;

    // "지금 조사 중인 하나" — 시선이 단일일 때만 비싼 파생(테마·거래대금·판독)이 붙는다(옛 규칙 승계).
    const inspection = useInspection({ isDaily, byKey, effSelected: subjectKeys, hovered });
    const { inspectKey, singleTarget, pointTarget } = inspection;

    // 넘침 뱃지에 손을 올린 동안의 무리 — 팝오버를 열면 그 목록이 대신 무리가 된다.
    const [badgeHover, setBadgeHover] = useState<readonly string[] | null>(null);
    const groupList = badge?.members ?? badgeHover;
    const groupSet = useMemo(() => (groupList ? new Set(groupList) : null), [groupList]);
    const groupColorOf = useMemo(() => {
        const m = new Map<string, string>();
        groupList?.forEach((k, i) => m.set(k, seriesColor(i)));
        return (key: string): string => m.get(key) ?? "var(--text-secondary)";
    }, [groupList]);

    const baseOpacity = lineOpacity(lines.length);
    const dimmed = dimOpacity(lines.length);

    // 복기 스냅샷 — 테마·거래대금의 재료(분봉·시선 단일일 때만 당긴다).
    const amountWidthOn = !isDaily && showAmount;
    const amountLabelsOn = !isDaily && showAmountLabels;
    const snapQ = useDaySnapshot(amountWidthOn || amountLabelsOn || showTheme ? singleTarget?.date ?? null : null);
    const lookup = useMemo(() => amountLookupOf(snapQ.data), [snapQ.data]);

    // ── 테마 오버레이 — 상태·계산·모드 규칙 전부 useThemeOverlay 가 소유한다.
    const replaySettings = useWorkbench((s) => s.replaySettings);
    const theme = useThemeOverlay({
        enabled: !isDaily && showTheme,
        target: pointTarget,
        snapshot: snapQ.data,
        hot: replaySettings,
        lookup,
        amountWidthOn,
        amountLabelsOn,
        hoveredLine: hovered,
        singleKey: singleTarget?.key ?? null,
        groupSet,
    });
    const themeOverlay = theme.overlay;

    const candleFocus = useMemo(() => candleFocusOf(theme.hovered, hovered), [theme.hovered, hovered]);

    // ── 테마 멤버 캔들 — 사용자가 테마 선/거터에서 명시로 켠 것(항목 캔들은 데이터 훅이 이미 만든다).
    const candles = useCandles({ pointTarget, snapshot: snapQ.data, focus: candleFocus, nameOf, grain });

    const amount = useAmountReadout({
        isDaily, singleTarget, pointTarget, amountWidthOn, amountLabelsOn, lookup,
        themeOverlay, themeRuns: theme.runs, themeHovered: theme.hovered, hovered,
        nameOf, scales, box, openReadingX: null, anchorMinutes: [],
    });

    // 역할 판정은 순수 함수(lineVisual)가, 색 배정은 여기가 한다.
    const visualOf = useCallback((key: string): { v: LineVisual; color: string } => {
        const v = lineVisual(key, { selected: subjectKeys, hovered, group: groupSet });
        const color = v.role === "selected" ? ACTIVE
            : v.role === "group" ? groupColorOf(key)
                : v.role === "hovered" ? HOVER
                    : "var(--text-secondary)";
        return { v, color };
    }, [subjectKeys, hovered, groupSet, groupColorOf]);

    // 모수가 갈리면 열려 있던 넘침 목록을 닫는다 — 사라진 선의 이름이 목록에 남지 않게.
    // (예전엔 척도 변경에 매달아 뒀는데, 창이 상수가 된 지금 이 목록이 실제로 상하는 계기는 모수뿐이다.)
    useEffect(() => { setBadge(null); setBadgeHover(null); }, [byKey]);

    // ── 손짓: 거터 칩 **클릭 = 고정 토글**(이 패널의 본론이 모수 구성이라 한 번 누르는 자리를 준다),
    //    Ctrl(⌘)+클릭 = 시선 이동(차트 패널·타점 정보가 따라온다). 규칙과 그 이유는 GutterLayer 주석.
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);
    const onGoTo = useCallback((s: OverlayLine): void => {
        if (s.kind === "point") goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "norm-overlay");
        else goToDay({ code: s.stockCode, date: s.date }, "norm-overlay");
    }, [goToPoint, goToDay]);

    // ── 오른쪽 이름 거터 — 내 항목과 테마가 한 목록에 서고, 칩 모양으로 갈린다(사용자 확정).
    const gutterLayoutView = useGutter({
        lines: showGutter ? lines : [], view: viewport.view, viewX, scaleY: scales?.y ?? null, box,
        nameOf, subjectKeys, hovered,
        themeOverlay: showGutter ? themeOverlay : null,
        themeHovered: theme.hovered,
    });
    const gutterHandlers = useMemo<GutterHandlers>(() => ({
        onItemClick: (key, ev) => {
            const s = byKey.get(key);
            if (!s) return;
            if (ev.ctrlKey || ev.metaKey) onGoTo(s); else data.togglePin(s);
        },
        onItemContext: (key, ev) => {
            ev.preventDefault();
            const s = byKey.get(key);
            // ⌃클릭이 contextmenu 로 오는 mac 은 비켜 간다 — 같은 손짓이 두 번 먹으면 안 된다.
            if (s && !ev.ctrlKey && !ev.metaKey) data.togglePin(s);
        },
        onItemHover: setHovered,
        onThemeClick: candles.toggle,
        onThemeHover: theme.setHovered,
        onItemBadge: (at, keys) => setBadge({ ...at, members: keys }),
        onItemBadgeHover: setBadgeHover,
        onThemeBadge: theme.openBadge,
    }), [byKey, data, onGoTo, candles.toggle, theme.setHovered, theme.openBadge]);
    /**
     * 바닥 원점 스택 — **등록 순**(시선 먼저, 그다음 고정 순 — 사용자 확정)으로 상한까지 세우고
     * 나머지는 뱃지 하나로 접는다. 한 줄 표기는 grain 이 정한다: 일봉 `날짜 종목` / 분봉 `날짜 시각 종목`.
     */
    const originItems = useMemo<OriginItem[]>(() => {
        const ordered = [...lines].sort((a, b) => Number(subjectKeys.has(b.key)) - Number(subjectKeys.has(a.key)));
        return ordered.map((s) => ({
            key: s.key,
            text: s.kind === "point"
                ? `${shortDate(s.date)} ${s.time.slice(0, 5)} ${nameOf(s.stockCode)}`
                : `${shortDate(s.date)} ${nameOf(s.stockCode)}`,
            color: visualOf(s.key).color,
            selected: subjectKeys.has(s.key),
            pinned: data.isPinned(s),
            lit: subjectKeys.has(s.key) || s.key === hovered,
        }));
    }, [lines, subjectKeys, hovered, nameOf, visualOf, data]);

    /**
     * 점선이 시작할 높이 — **원점 봉의 저가**(캔들이 있으면 그중 가장 낮은 것, 없으면 0선).
     * 봉에서 살짝 떨어져 내려와야 그림을 안 가린다(사용자 확정) — 그 간격은 OriginStack 이 더한다.
     */
    const originLowY = useMemo(() => {
        if (!scales) return 0;
        let lowest: number | null = null;
        if (effCandles) {
            for (const s of lines) {
                const k = data.candlesByKey.get(s.key)?.find((c) => c.x === 0);
                if (k && (lowest === null || k.l < lowest)) lowest = k.l;
            }
        }
        return scales.y(lowest ?? 0);
    }, [scales, effCandles, lines, data.candlesByKey]);

    const origin = useMemo<Omit<OriginStackProps, "box">>(() => ({
        items: originItems.slice(0, ORIGIN_CAP),
        hidden: originItems.slice(ORIGIN_CAP),
        x0: scales ? scales.x(0) : 0,
        lowY: originLowY,
        onClick: (key, ev) => {
            const s = byKey.get(key);
            if (!s) return;
            if (ev.ctrlKey || ev.metaKey) onGoTo(s); else data.togglePin(s);
        },
        onContext: (key, ev) => {
            ev.preventDefault();
            const s = byKey.get(key);
            if (s && !ev.ctrlKey && !ev.metaKey) data.togglePin(s);
        },
        onHover: setHovered,
        onBadge: (at, keys) => setBadge({ ...at, members: keys }),
        onBadgeHover: setBadgeHover,
    }), [originItems, scales, originLowY, byKey, data, onGoTo]);

    const gutter = useMemo<GutterView>(() => ({
        layout: gutterLayoutView,
        colorOf: (c: GutterCandidate) => (c.kind === "item" ? visualOf(c.key).color : theme.colorOf(c.key)),
        litOf: (c: GutterCandidate) => (c.kind === "item"
            ? c.key === hovered || subjectKeys.has(c.key)
            : theme.hovered?.has(c.key) ?? false),
        stateOf: (key: string) => {
            const s = byKey.get(key);
            return { selected: visualOf(key).v.role === "selected", pinned: s ? data.isPinned(s) : false };
        },
        isCandleOn: (code: string) => candles.codes.has(code),
        themeHovered: theme.hovered,
        themeSwapped: theme.swapped,
        // 툴팁의 전일比 — 일봉은 원점이 곧 전일 종가(baseRate=0)라 되돌릴 값이 없다(없음으로 둔다).
        absOf: (c: GutterCandidate) => {
            if (c.kind === "theme") return themeOverlay ? c.y + themeOverlay.baseRate : null;
            const s = byKey.get(c.key);
            return s && s.baseRate !== 0 ? c.y + s.baseRate : null;
        },
        handlers: gutterHandlers,
    }), [gutterLayoutView, visualOf, theme, hovered, subjectKeys, byKey, data, candles.codes, themeOverlay, gutterHandlers]);

    /** 지금 조사 중인 선의 그룹 이름들 — 발끝 표기(읽기 전용 — 그룹 편집 입구는 다른 패널의 몫). */
    const groupsView = useGroups();
    const inspectGroupNames = useMemo(() => {
        const s = inspectKey ? byKey.get(inspectKey) : null;
        if (!s) return [];
        const ids = s.kind === "point"
            ? groupsView.groupNamesOf({ stockCode: s.stockCode, date: s.date, time: s.time })
            : groupsView.chartGroupNamesOf(s);
        return ids.map((id) => groupsView.groupByName.get(id)?.name).filter((n): n is string => !!n);
    }, [inspectKey, byKey, groupsView]);

    /**
     * 앵커 표기(수준선·표식)를 받을 주인 — 시선 단일 + (다르면) 호버 하나(옛 규칙 그대로).
     * 토글과 무관하게 뽑는다: 수준선은 토글이 자르지만 **상단 표식은 상시**라(사용자 확정) 주인이 먼저다.
     */
    const annOwners = useMemo<LevelOwner[]>(() => {
        const single = subjectKeys.size === 1 ? [...subjectKeys][0] : null;
        const out: LevelOwner[] = [];
        const sel = single ? byKey.get(single) : null;
        if (sel) out.push({ s: sel, color: visualOf(sel.key).color });
        const hov = hovered && hovered !== single ? byKey.get(hovered) : null;
        if (hov) out.push({ s: hov, color: visualOf(hov.key).color });
        return out;
    }, [subjectKeys, byKey, hovered, visualOf]);

    /**
     * 그 차트가 낼 수준선 — **두 토글이 따로 자른다**: 기준선(앵커)은 showLevels, 전일 종가선은 zeroLine.
     * 재료는 데이터 훅이 이미 켜진 것만 실어 오므로(zeroLevelOf) 여기선 기준선 쪽만 걸러 낸다.
     */
    const levelsOf = useCallback(
        (ck: string): NormLevel[] => {
            const all = data.levelsByChart.get(ck) ?? [];
            return showLevels ? all : all.filter((lv) => lv.zero !== undefined);
        },
        [data.levelsByChart, showLevels],
    );

    // 자리 잡은 수준선 줄 — 가로선·값 칩·좌측 태그가 **같은 줄**을 본다(칩·태그가 같은 높이라는 계약).
    const levelRows = useMemo<LevelRowsView>(() => {
        if (!scales || (!showLevels && !zeroOn)) return { rows: [], hidden: [] };
        return buildLevelRows(annOwners, levelsOf, scales.y, box, !isDaily, nameOf);
    }, [scales, showLevels, zeroOn, annOwners, levelsOf, box, isDaily, nameOf]);

    // 상단 표식 무리 — 상시(토글 없음). 고가 조회는 항목 캔들(선과 같은 값 공간)에서.
    const markGroups = useMemo<MarkGroup[]>(() => annOwners
        .map(({ s, color }) => {
            const candles = data.candlesByKey.get(s.key);
            return {
                line: s, color,
                marks: data.marksByChart.get(s.chartKey) ?? [],
                highAt: (x: number) => candles?.find((c) => c.x === x)?.h ?? null,
            };
        })
        .filter((g) => g.marks.length > 0), [annOwners, data.candlesByKey, data.marksByChart]);


    // ── 머리글 프롭 안정화 — OverlayHeader 는 React.memo 다.
    const headerCandles = useMemo(
        () => ({ alpha: candles.alpha, setAlpha: candles.setAlpha }),
        [candles.alpha, candles.setAlpha],
    );
    /**
     * "확실히 화면 밖"인 선 수 — 창이 붙들려 있는 대가를 머리글이 말한다.
     * 선마다 경계 상자를 **모수가 갈릴 때 한 번** 접어 두고, 팬·확대 프레임마다는 상자끼리만 견준다
     * (선당 700점 × 30선을 매 프레임 훑으면 이동이 뻑뻑해진다 — 솎기를 넣은 것과 같은 이유).
     */
    const lineBoxes = useMemo(() => lines.map(lineBox), [lines]);
    // ⚠ 상자에 넓이가 생기기 전(ResizeObserver 첫 발화 전)에는 세지 않는다 — 폭 0 이면 d3 가 보이는
    //   구간을 한 점으로 접어, 멀쩡한 선들이 한 프레임 동안 "밖"으로 세어진다(숫자가 번쩍인다).
    const measured = box.width > 0 && box.height > 0;
    const outOfView = useMemo(
        () => (measured && viewport.view ? lineBoxes.filter((b) => b !== null && !boundsOverlap(b, viewport.view!)).length : 0),
        [measured, lineBoxes, viewport.view],
    );
    const headerCounts = useMemo(
        () => ({ shown: lines.length, population: data.population, missing: data.missing, outOfView }),
        [lines.length, data.population, data.missing, outOfView],
    );
    const headerTheme = useMemo(
        () => ({ lineCount: themeOverlay?.lines.length ?? null, hasTarget: pointTarget !== null }),
        [themeOverlay, pointTarget],
    );

    /**
     * 그림 세 층의 표시목록 — **매 렌더 새로 만든다**(memo 하지 않는다).
     * 어차피 팬 프레임마다 좌표가 전부 바뀌고, 비싼 건 목록이 아니라 DOM 펴기였는데 그건 캔버스가 없앴다.
     */
    const candleSets: CandleSeries[] = [];
    if (effCandles) {
        for (const s of lines) {
            if (!theme.lineShown(s.key)) continue;
            const ks = data.candlesByKey.get(s.key);
            if (!ks || ks.length === 0) continue;
            const { v } = visualOf(s.key);
            const lit = v.role !== "base";
            candleSets.push({
                key: s.key, candles: ks,
                // 시선·짚은 것은 온전한 선명도. **recede 가 최우선**(사용자 지적 — 겹쳤을 때 호버해도
                // 남이 안 죽어서 뭘 짚었는지 잘 안 보였다): 지금 딴 걸 짚고 있으면 base 든 시선·무리든
                // 전부 한 단계 더 죽는다. recede 가 아닐 때만 평소 규칙(적/청 공통이라 진하기가 항목을 가름).
                opacity: candles.opacityOf(false) * (v.recede ? CANDLE_RECEDE_RATIO : v.dim ? CANDLE_OTHER_RATIO : lit ? 1 : CANDLE_OTHER_RATIO),
                markers: subjectKeys.size === 1 && subjectKeys.has(s.key),
            });
        }
    }
    for (const m of candles.members) {
        if (!candles.memberShown(m.code)) continue;
        candleSets.push({ key: `member|${m.code}`, candles: m.candles, opacity: candles.opacityOf(true), markers: false });
    }

    const paintLayers: DrawLayer[] = scales && bounds
        ? orderPaint({
            candles: candleSets.length > 0
                ? candleLayer({ sets: candleSets, daily: isDaily, scales, box })
                : EMPTY_CANDLES,
            "theme-lines": themeOverlay && !theme.swapped
                ? themeLinesLayer({
                    overlay: themeOverlay, runs: amountWidthOn ? theme.runs : null, hovered: theme.hovered,
                    project: (pts, step) => flatten(viewport.themePath(pts, step), scales.x, scales.y),
                    clip: viewX, lineStep: viewport.lineStep,
                })
                : EMPTY_THEME_LINES,
            lines: !effCandles
                ? normLinesLayer({
                    lines, scales,
                    lineShown: theme.lineShown,
                    visualOf,
                    opacity: { dimmed, recede: RECEDE_OPACITY, base: baseOpacity },
                    isPointUnit,
                    amounts: amountWidthOn ? amount.amounts : null,
                    project: (pts, step) => flatten(viewport.themePath(pts, step), scales.x, scales.y),
                    lineStep: viewport.lineStep,
                })
                : EMPTY_LINES,
        })
        : [];
    return (
        <div style={wrap}>
            <OverlayHeader
                grain={grain}
                toggles={toggles}
                candles={headerCandles}
                counts={headerCounts}
                theme={headerTheme}
                onResetView={viewport.onResetView}
                pinCount={data.pinCount}
                onClearPins={data.clearPins}
            />

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <OverlayPlot
                isDaily={isDaily}
                xUnit={xUnit}
                loading={data.loading}
                linesEmpty={lines.length === 0}
                showLabels={showLabels}
                viewport={viewport}
                paintLayers={paintLayers}
                theme={theme}
                gutter={gutter}
                origin={origin}
                showGutter={showGutter}
                candles={candles}
                inspection={inspection}
                setHovered={setHovered}
                onHoverPanel={setHoveringPanel}
                readoutAt={amount.readoutAt}
                amountLabels={amount.amountLabels}
                levels={levelRows}
                markGroups={markGroups}
            />
            </div>

            <OverlayMenus
                badge={badge}
                onCloseBadge={closeBadge}
                byKey={byKey}
                groupColorOf={groupColorOf}
                nameOf={nameOf}
                onGoTo={onGoTo}
                setHovered={setHovered}
            />

            <OverlayFooter
                grain={grain}
                groupNames={inspectGroupNames}
                themeMode={theme.mode}
                themeLineCount={themeOverlay?.lines.length ?? 0}
                candles={{
                    names: candles.members.map((m) => m.name),
                    onClear: candles.clear,
                }}
                amountWidthOn={amountWidthOn}
            />
        </div>
    );
}

// CandlesView 재수출 — OverlayPlot 프롭 타입이 이 패널 밖(카탈로그)에서 안 새게 여기서 닫는다.
export type { CandlesView };

const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
