// 정규화 겹치기 패널 — 옛 골격 패널의 골조(캔버스 3겹·라벨 손잡이·공통 척도·테마·거래대금)에
// 새 데이터 모델(시선 1 + 고정 N 슬롯, chartQuery 벌크, 자동 원점)을 끼운 것.
//
// ## 무엇이 갈렸나(골격 시절 대비)
//  · 모수: 깔때기 구독 → **명시 등록**(시선=focus 자동, 고정=라벨 우클릭·리셋 없음) — 사용자 확정.
//  · 선: 손 피벗 골격 → **실물 정규화 종가선**(일봉=D−1 종가 원점 / 분봉=타점 시각 원점 %p).
//  · 캔들: 참고용 배경(클릭 토글) → **기본 렌더**(적으면 캔들, 많으면 선 — 자동+수동 토글).
//  · 라벨: 경로 왼쪽 끝 고정 → **화면에서 잘리는 자리**(줌·팬과 무관하게 항상 손잡이가 남는다).
//
// ## 이 파일은 **배선**이다
// 상태 채널은 훅들이 나눠 소유한다 — 데이터(useNormLines)·뷰포트(useOverlayViewport)·
// 조사 대상(useInspection)·표시 토글(useOverlayToggles)·테마(useThemeOverlay)·멤버 캔들(useCandles)·
// 복기 파생(useAmountReadout). 여기 남는 건 그 사이 배선과 표시목록(paintLayers) 조립뿐이다.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { labelAnchorAt, labelHandles, lineOpacity, dimOpacity, lineVisual, type LineVisual, type OverlayLine } from "./overlay.js";
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
import { LABEL_CELL } from "./LabelLayer.js";
import { amountLookupOf } from "./amountLayer.js";
import { useThemeLabels, useThemeOverlay } from "./useThemeOverlay.js";
import { type LevelOwner } from "./LevelsLayer.js";
import { normLinesLayer } from "./linesLayer.js";
import { candleLayer, type CandleSeries } from "./candleLayer.js";
import { themeLinesLayer } from "./themeLinesLayer.js";
import { flatten, orderPaint, type DrawLayer } from "../canvas/drawList.js";
import { useWorkbench } from "../../store/workbench.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { ACTIVE, HOVER, seriesColor } from "../../styles/palette.js";

/** 꺼져 있어도 **층의 자리는 남긴다** — 순서 규약을 켜고 끔과 무관하게 재려면 빈 층이 서 있어야 한다. */
const EMPTY_CANDLES: DrawLayer = { name: "candles", groups: [] };
const EMPTY_THEME_LINES: DrawLayer = { name: "theme-lines", groups: [] };
const EMPTY_LINES: DrawLayer = { name: "lines", groups: [] };
/** 무리(뱃지) 안에서 안 짚은 선의 진하기 — 색은 그대로 두고 이만큼만 물러난다. */
const RECEDE_OPACITY = 0.3;
/** 캔들 모드에서 시선이 아닌 항목의 진하기 배율 — 적/청이 공통이라 진하기가 항목을 가른다(라벨이 정체를 진다). */
const CANDLE_OTHER_RATIO = 0.45;

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — "일봉에서 훑고 분봉으로 확인"의 동시 사용 시나리오. */
export function NormOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    const toggles = useOverlayToggles(grain);
    const { mode, dailyMarket, showFuture, showLevels, showLabels, showAmount, showAmountLabels, showTheme, setShowTheme } = toggles;

    const isDaily = grain === "daily";
    const isPointUnit = !isDaily;
    const xUnit: XUnit = isDaily ? "day" : "min";

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
    const data = useNormLines(grain, dailyMarket);
    const { lines, byKey, subjectKeys, nameOf } = data;

    // 캔들/선 — 자동은 항목 수가 정한다(적으면 캔들 — 사용자 확정: 기본은 캔들).
    const effCandles = mode === "candles" || (mode === "auto" && lines.length > 0 && lines.length <= AUTO_CANDLE_MAX);

    // ── 호버 — 훅 여럿(조사 대상·테마)이 나눠 읽는 채널이라 배선 층(여기)이 소유한다.
    const [hovered, setHovered] = useState<string | null>(null);
    // 호버 유령 가드 — 짚고 있던 선이 목록에서 사라지면 mouseleave 가 영영 안 온다(옛 규칙 그대로).
    useEffect(() => {
        if (hovered !== null && !byKey.has(hovered)) setHovered(null);
    }, [hovered, byKey]);

    // ── 뭉친 라벨의 멤버 목록(뱃지). 그래프를 만지면(팬·확대) 닫는다.
    const [badge, setBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
    const closeBadge = useCallback(() => setBadge(null), []);

    const gutter = !isDaily && showTheme;
    const viewport = useOverlayViewport({ isDaily, showFuture, lines, gutter, onGestureStart: closeBadge });
    const { box, bounds, boundsKey, scales, viewX } = viewport;

    // "지금 조사 중인 하나" — 시선이 단일일 때만 비싼 파생(테마·거래대금·판독)이 붙는다(옛 규칙 승계).
    const inspection = useInspection({ isDaily, byKey, effSelected: subjectKeys, hovered });
    const { inspectKey, singleTarget, pointTarget } = inspection;

    // 라벨 축약 — 화면 좌표로 묶는다. 시선·호버는 묶음에서 빼고 제 손잡이로 세운다.
    const pinnedForHandles = useMemo(() => new Set([...subjectKeys, ...(hovered ? [hovered] : [])]), [subjectKeys, hovered]);
    const handles = useMemo(() => {
        if (!showLabels || !scales || !viewport.view) return [];
        const anchors = [];
        for (const s of lines) {
            const p = labelAnchorAt(s.points, viewport.view);
            if (p) anchors.push({ key: s.key, x: scales.x(p.x), y: scales.y(p.y) });
        }
        return labelHandles(anchors, pinnedForHandles, LABEL_CELL.w, LABEL_CELL.h);
    }, [showLabels, scales, viewport.view, lines, pinnedForHandles]);

    // 뱃지 호버 무리 — id 하나만 상태로 들고 멤버는 지금 목록에서 되찾는다(낡은 상태 표현 불가능 — 옛 규칙).
    const [badgeHover, setBadgeHover] = useState<string | null>(null);
    const hoveredBadgeMembers = useMemo<readonly string[] | null>(() => {
        if (!badgeHover) return null;
        const hit = handles.find((h) => h.kind === "badge" && h.id === badgeHover);
        return hit?.kind === "badge" ? hit.members : null;
    }, [badgeHover, handles]);
    const groupList = badge?.members ?? hoveredBadgeMembers;
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
    const themeLabels = useThemeLabels(themeOverlay, scales, viewX, box);

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

    useEffect(() => { setBadge(null); setBadgeHover(null); }, [boundsKey, grain]);

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

    // 수준선(기준선)을 받을 선 — 시선 단일 + (다르면) 호버 하나(옛 규칙 그대로).
    const levelOwners = useMemo<LevelOwner[]>(() => {
        if (!showLevels) return [];
        const single = subjectKeys.size === 1 ? [...subjectKeys][0] : null;
        const out: LevelOwner[] = [];
        const sel = single ? byKey.get(single) : null;
        if (sel) out.push({ s: sel, color: visualOf(sel.key).color, right: true });
        const hov = hovered && hovered !== single ? byKey.get(hovered) : null;
        if (hov) out.push({ s: hov, color: visualOf(hov.key).color, right: false });
        return out;
    }, [showLevels, subjectKeys, byKey, hovered, visualOf]);

    // ── 손짓: 라벨 클릭 = 시선 이동(차트 패널·타점 정보가 따라온다) / 라벨 우클릭 = 고정 토글(사용자 확정).
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);
    const onLabelClick = useCallback((s: OverlayLine): void => {
        if (s.kind === "point") goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "norm-overlay");
        else goToDay({ code: s.stockCode, date: s.date }, "norm-overlay");
    }, [goToPoint, goToDay]);
    const onLabelContext = useCallback((s: OverlayLine, ev: { preventDefault: () => void }): void => {
        ev.preventDefault();
        data.togglePin(s);
    }, [data]);

    // ── 머리글 프롭 안정화 — OverlayHeader 는 React.memo 다.
    const headerCandles = useMemo(
        () => ({ alpha: candles.alpha, setAlpha: candles.setAlpha }),
        [candles.alpha, candles.setAlpha],
    );
    const headerCounts = useMemo(
        () => ({ shown: lines.length, population: data.population, missing: data.missing }),
        [lines.length, data.population, data.missing],
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
                // 시선·짚은 것은 온전한 선명도, 나머지는 물러난다 — 적/청이 공통이라 진하기가 항목을 가른다.
                opacity: candles.opacityOf(false) * (v.dim ? CANDLE_OTHER_RATIO : v.recede ? 0.7 : lit ? 1 : CANDLE_OTHER_RATIO),
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
                locked={viewport.locked}
                onToggleLock={viewport.onToggleLock}
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
                themeLabels={themeLabels}
                candles={candles}
                inspection={inspection}
                byKey={byKey}
                setHovered={setHovered}
                handles={handles}
                visualOf={visualOf}
                nameOf={nameOf}
                isPinnedItem={data.isPinned}
                onLabelClick={onLabelClick}
                onLabelContext={onLabelContext}
                onBadgeOpen={(at, members) => setBadge({ ...at, members })}
                onBadgeHover={setBadgeHover}
                onHoverPanel={setHoveringPanel}
                readoutAt={amount.readoutAt}
                amountLabels={amount.amountLabels}
                levelOwners={levelOwners}
                levelsOf={(ck) => data.levelsByChart.get(ck) ?? []}
            />
            </div>

            <OverlayMenus
                badge={badge}
                onCloseBadge={closeBadge}
                byKey={byKey}
                groupColorOf={groupColorOf}
                nameOf={nameOf}
                onLabelClick={onLabelClick}
                setHovered={setHovered}
            />

            <OverlayFooter
                grain={grain}
                groupNames={inspectGroupNames}
                locked={viewport.locked}
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
