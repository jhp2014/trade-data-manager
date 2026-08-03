import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { chartQuery, pointAnchorsQuery, computedAxesQuery } from "../api/queries.js";
import { putPointAnchor, removePointAnchor } from "../api/pointAnchors.js";
import { kstToUnix } from "../lib/derive.js";
import { useChartViews, resolvePointAnchorLines, parseAnchorLineId, ANCHOR_LINE_COLOR } from "../lib/chartFrame.js";
import { anchorParamByKey, type AnchorCoord, type PointAnchor } from "@trade-data-manager/market/domain";
import { usePriceLinesForChart, useReviewPointData } from "../lib/chartHooks.js";
import { CandleMenu, type MenuBar } from "../chart/CandleMenu.js";
import type { RenderLine } from "../api/priceLines.js";
import { useStockName } from "../lib/useStockName.js";
import { useTags } from "../lib/useTags.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { TagMenu } from "../chart/TagMenu.js";
import { TagChips } from "../components/TagChips.js";
import { DailyChart } from "../chart/DailyChart.js";
import {
    AmountMarkerToggle,
    Center,
    ChartHeader,
    ChartPanes,
    GuideToggle,
    MarketToggle,
    MarkerGroup,
    PinToggle,
    ScaleToggle,
    SearchLineToggle,
    ViewToggles,
} from "./ChartPanelChrome.js";
import { TextToggle, Sep, ControlGroup } from "../components/ControlChrome.js";

// 차트 패널(복기 플레인) — 일봉(상) + 분봉(하) 듀얼. 껍데기(헤더·2단·토글)는 ChartPanelChrome 공용.
// 소스는 chartQuery(DB) — useChartHotkeys·RankFilterPanel 과 **같은 RQ 키**라 캐시를 공유한다(중복 페치 0).
// 가격선/타점 편집 유스케이스는 usePriceLinesForChart·useReviewPointData 훅으로 분리 — 여긴 뷰 파생+렌더.
// 분봉 ctrl+클릭·더블클릭=타점 이동, 스페이스바=타점 저장(토글), 숫자키 1~4=태그 프리셋(전역 useChartHotkeys).
// 태그 입력은 타점 ▼ **우클릭**(TagMenu) — 타점 저장과 분리된 동작이라 키·클릭도 갈라 둔다.
export function ChartPanel({ panelId }: { panelId: string }): JSX.Element {
    const { code, anchorDate, viewDate: searchDate, time, setTime, setSearchDate } = usePlaneBus("replay");
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const cs = useWorkbench((s) => s.chartSettings);
    const chartZoom = useWorkbench((s) => s.chartZoom); // f 줌(전역 — 두 차트 동시 확대/축소)
    const view = useWorkbench((s) => s.chartViews[panelId]) ?? defaultChartView(panelId); // 일봉만/분봉만/일봉+분봉(패널별·영속)
    const setChartView = useWorkbench((s) => s.setChartView);
    const setView = (v: ChartView): void => setChartView(panelId, v);
    const collapsed = useWorkbench((s) => s.panelControlsCollapsed[panelId]) ?? false; // 컨트롤 바 접힘(패널별·영속)
    const toggleControls = useWorkbench((s) => s.togglePanelControls);
    const expanded: "daily" | "minute" | null = view === "both" ? null : view;
    // 헤더 토글 — 패널별 store 영속(usePanelUi). 프리셋 전환(재마운트)·새로고침에 유지.
    const [showMarkers, setShowMarkers] = usePanelUi(panelId, "showMarkers", true); // 분봉 거래대금 마커 ON/OFF
    const [showPointInfo, setShowPointInfo] = usePanelUi(panelId, "showPointInfo", true); // 현재 타점(시간선) readout — 기본 표시
    const [showLine, setShowLine] = usePanelUi(panelId, "showLine", true); // 검색 세로선 표시
    const [pinMinute, setPinMinute] = usePanelUi(panelId, "pinMinute", false); // 분봉 기준일 고정(일봉 클릭 무시)
    const [lockScale, setLockScale] = usePanelUi(panelId, "lockScale", false); // 분봉 스케일 고정
    const [showGuide, setShowGuide] = usePanelUi(panelId, "showGuide", true); // +30% 가이드선(검색일 전일종가 ×1.3)

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)
    const { tagsOf } = useTags();
    const [tagMenu, setTagMenu] = useState<{ time: string; x: number; y: number } | null>(null);
    // 두 날짜: 일봉=기준일(앵커, 2년), 분봉·큐레이션=검색날짜(기본=기준일, 일봉 봉 클릭이 드리프트). 고정 시 기준일 붙박이.
    const viewDate = pinMinute ? anchorDate : searchDate;
    const drifted = viewDate !== anchorDate;
    // keepPreviousData: 전환 중 직전 번들 유지 — 차트가 로딩으로 언마운트되지 않아 뷰 상태(스케일 고정)가 보존.
    const dailyQ = useQuery({ ...chartQuery(code, anchorDate), placeholderData: keepPreviousData });
    const minuteQ = useQuery({ ...chartQuery(code, viewDate), placeholderData: keepPreviousData }); // viewDate=anchor 면 같은 쿼리(RQ dedup)
    const { dailyView, minuteView, dailyFrameKey, minuteFrameKey, pctBase } = useChartViews(dailyQ.data, minuteQ.data, mode, viewDate);

    // 가격선 주석(조회·해소·추가/삭제/clear) + 복기 타점(조회·savedPoints) — 훅으로 분리.
    const { resolvedLines, dLines, hasLines, addLine, lineIdAt, removeLineById, clear } = usePriceLinesForChart(code, viewDate, dailyView, minuteView);
    const { savedPoints, focusedPoint, axisTotal } = useReviewPointData(code, viewDate, time);

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음. 검색날짜(viewDate) 기준.
    const markerTime = useMemo(() => (time && viewDate ? kstToUnix(viewDate, time) : null), [time, viewDate]);

    // ── 타점 파라미터 앵커 — 현재 **저장 타점**의 계산 입력 좌표. 지정/해제는 봉 우클릭 메뉴(CandleMenu).
    // 소유자는 포커스 시각이 아니라 focusedPoint 다: 포커스는 a/d 로 봉을 옮길 때마다 바뀌는 아무 분봉 시각이라
    // 그걸로 가드하면 저장 타점이 아닌 곳에서도 버튼이 활성으로 보이고, 눌러도 FK 로 거부돼 조용히 실패한다.
    const anchorTime = focusedPoint?.time ?? null;
    const qc = useQueryClient();
    const anchorsQ = useQuery(pointAnchorsQuery(code, viewDate));
    const activeAnchors = useMemo(
        () => (anchorTime ? (anchorsQ.data ?? []).filter((a) => a.time === anchorTime) : []),
        [anchorsQ.data, anchorTime],
    );
    const invAnchors = (): void => {
        void qc.invalidateQueries({ queryKey: pointAnchorsQuery(code, viewDate).queryKey });
        // 앵커는 계산 축(params 선언)의 입력 — 지정/이동/해제 즉시 축 값이 따라와야 한다(서버는 지문으로
        // 그 타점만 다시 굽는다). 사용자가 새로고침을 의식하게 하지 않는 게 규칙.
        void qc.invalidateQueries({ queryKey: computedAxesQuery().queryKey });
    };
    const setAnchorMut = useMutation({ mutationFn: putPointAnchor, onSuccess: invAnchors });
    const clearAnchorMut = useMutation({
        // coord 없이 부르면 그 param 전부 해제 — 단일 파라미터(기준선)는 그게 곧 그 하나다.
        mutationFn: (v: { param: string; coord?: AnchorCoord }) =>
            removePointAnchor({ stockCode: code, date: viewDate, time: anchorTime ?? "" }, v.param, v.coord),
        onSuccess: invAnchors,
    });
    // 앵커 선 — **저장된 시장의 값**을 raw 번들에서 읽는다(차트 모드와 무관 — 사람이 지목한 그 값).
    const anchorLines = useMemo(
        () => (activeAnchors.length > 0 ? resolvePointAnchorLines(activeAnchors, dailyQ.data, minuteQ.data) : []),
        [activeAnchors, dailyQ.data, minuteQ.data],
    );
    const dailyLines = useMemo(() => [...dLines, ...anchorLines.filter((l) => l.kind === "D")], [dLines, anchorLines]);
    const minuteLines = useMemo(() => [...resolvedLines, ...anchorLines], [resolvedLines, anchorLines]);

    // ── 봉 우클릭 메뉴 — 가격선(field 선택)과 파라미터 앵커 지정이 한자리에. 선 근처 우클릭은 삭제 항목만.
    const [candleMenu, setCandleMenu] = useState<{ x: number; y: number; candle?: { date: string; time?: string }; nearLine?: RenderLine } | null>(null);
    const menuBars = useMemo((): { un: MenuBar | null; krx: MenuBar | null } | undefined => {
        const c = candleMenu?.candle;
        if (!c) return undefined;
        const num = (bar: { open: string; high: string; low: string; close: string } | null | undefined): MenuBar | null =>
            bar ? { open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close) } : null;
        if (c.time) {
            const m = minuteQ.data?.minutes.find((x) => x.date === c.date && x.time === c.time);
            return { un: num(m?.un), krx: num(m?.krx) };
        }
        const d = dailyQ.data?.daily.find((x) => x.date === c.date);
        return { un: num(d?.un), krx: num(d?.krx) };
    }, [candleMenu, dailyQ.data, minuteQ.data]);
    // 메뉴의 선/앵커 삭제 라우팅 — 앵커 선 id 는 param+좌표(가격선 id 와 네임스페이스로 구분).
    const removeLineOrAnchor = (id: string): void => {
        const anchor = parseAnchorLineId(id);
        if (anchor) clearAnchorMut.mutate(anchor);
        else removeLineById(id);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            <ChartHeader
                plane="replay"
                code={code}
                name={name}
                anchorDate={anchorDate}
                viewDate={viewDate}
                drifted={drifted}
                onResetSearch={() => setSearchDate(null)}
                baseFallback={minuteView?.baseFallback}
                collapsed={collapsed}
                onToggleControls={() => toggleControls(panelId)}
                badges={
                    focusedPoint ? (
                        // 현재 타점의 태그(옛 단일 type 배지 자리) + 파라미터 앵커 칩 — 헤더 한 줄이라 wrap 없이 잘린다.
                        // 앵커 선은 그 타점에 서 있을 때만 그려지므로(소유가 타점), "이 타점이 기준선을 가졌나"를
                        // 선 말고도 알려주는 단서가 필요하다 — 봉을 옮겨 선이 사라져도 돌아오면 여기서 확인된다.
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <TagChips tags={tagsOf({ stockCode: code, date: viewDate, time: focusedPoint.time })} style={{ maxWidth: 180, flexShrink: 1 }} />
                            <AnchorChips anchors={activeAnchors} />
                        </span>
                    ) : null
                }
            >
                <ViewToggles view={view} setView={setView} />
                <Sep />
                <ControlGroup>
                    <PinToggle on={pinMinute} toggle={() => setPinMinute((v) => !v)} />
                    <ScaleToggle on={lockScale} toggle={() => setLockScale((v) => !v)} />
                    <TextToggle active={showPointInfo} activeColor="var(--accent-primary)" onClick={() => setShowPointInfo((v) => !v)} title={showPointInfo ? "현재 타점 정보 끄기" : "현재 타점 정보 켜기"}>타점정보</TextToggle>
                </ControlGroup>
                <Sep />
                <MarkerGroup>
                    <AmountMarkerToggle on={showMarkers} toggle={() => setShowMarkers((v) => !v)} />
                    <SearchLineToggle on={showLine} toggle={() => setShowLine((v) => !v)} />
                    <GuideToggle on={showGuide} toggle={() => setShowGuide((v) => !v)} />
                </MarkerGroup>
                <Sep />
                <ControlGroup>
                    <TextToggle active={false} disabled={!hasLines} onClick={() => hasLines && clear()} title="가격선 전체 지우기">선 지우기</TextToggle>
                    <MarketToggle mode={mode} setMode={setMode} />
                </ControlGroup>
            </ChartHeader>

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && (dailyQ.isLoading || minuteQ.isLoading) && !dailyView && <Center text={`${code} 로딩중…`} />}
                {(dailyQ.isError || minuteQ.isError) && <Center text="오류 — 재시도 중…" />}
                {!!code && minuteView && dailyView && (
                    <ChartPanes
                        expanded={expanded}
                        viewDate={viewDate}
                        dailyTitle="봉 ctrl+클릭 / 더블클릭: 그 날짜로 검색 · 봉 우클릭: 메뉴(가격선·기준선)"
                        minuteTitle="ctrl+클릭 / 더블클릭: 타점 이동 · 스페이스바: 타점 저장 · 봉 우클릭: 메뉴(가격선·기준선)"
                        daily={
                            dailyView.length > 0 ? (
                                <DailyChart
                                    points={dailyView}
                                    frameKey={dailyFrameKey}
                                    lines={dailyLines}
                                    zoom={chartZoom != null}
                                    zoomBars={cs.dailyZoomBars}
                                    zoomOutBars={cs.dailyZoomOutBars}
                                    onRightClick={(d, at) => setCandleMenu({ ...at, candle: { date: d } })}
                                    onRemoveLine={(l) => removeLineOrAnchor(l.id)}
                                    onLineContext={(l, at) => setCandleMenu({ ...at, nearLine: l })}
                                    onCandleClick={pinMinute ? undefined : (d) => setSearchDate(d === anchorDate ? null : d)}
                                    searchDate={showLine && drifted ? viewDate : undefined}
                                    pctBase={pctBase}
                                    showGuide={showGuide}
                                />
                            ) : null
                        }
                        minute={
                            minuteView.points.length > 0 ? (
                                <MinuteChart
                                    points={minuteView.points}
                                    frameKey={minuteFrameKey}
                                    showAmountMarkers={showMarkers}
                                    lines={minuteLines}
                                    base={minuteView.base}
                                    pctBase={pctBase}
                                    markerTime={markerTime}
                                    savedPoints={savedPoints}
                                    axisTotal={axisTotal}
                                    showPointInfo={showPointInfo}
                                    zoom={chartZoom ? { bars: cs.minuteZoomBars, anchorTime: chartZoom.anchor } : null}
                                    lockTimeScale={lockScale}
                                    onMovePoint={(t) => setTime(t)}
                                    onRightClick={(a, at) => setCandleMenu({ ...at, candle: { date: a.date, time: a.time } })}
                                    onRemoveLine={(l) => removeLineOrAnchor(l.id)}
                                    onLineContext={(l, at) => setCandleMenu({ ...at, nearLine: l })}
                                    onTagPoint={(t, x, y) => setTagMenu({ time: t, x, y })}
                                    tagsOfTime={(t) => tagsOf({ stockCode: code, date: viewDate, time: t })}
                                />
                            ) : null
                        }
                    />
                )}
            </div>

            {tagMenu && (
                <TagMenu
                    anchor={{ x: tagMenu.x, y: tagMenu.y }}
                    point={{ stockCode: code, date: viewDate, time: tagMenu.time }}
                    label={`${name ?? code} · ${tagMenu.time.slice(0, 5)}`}
                    onClose={() => setTagMenu(null)}
                />
            )}

            {candleMenu && (
                <CandleMenu
                    anchor={{ x: candleMenu.x, y: candleMenu.y }}
                    candle={candleMenu.candle}
                    bars={menuBars}
                    nearLine={candleMenu.nearLine}
                    lineIdAtCandle={candleMenu.candle ? lineIdAt(candleMenu.candle.date, candleMenu.candle.time) : undefined}
                    activeTime={anchorTime}
                    activeAnchors={activeAnchors}
                    onAddLine={(field) => candleMenu.candle && addLine(candleMenu.candle.date, candleMenu.candle.time, field)}
                    onRemoveLine={removeLineOrAnchor}
                    onSetAnchor={(param, price) => {
                        const c = candleMenu.candle;
                        if (!c || !anchorTime) return;
                        setAnchorMut.mutate({
                            stockCode: code, date: viewDate, time: anchorTime, param,
                            anchorDate: c.date, anchorTime: c.time,
                            field: price?.field, market: price?.market,
                        });
                    }}
                    onClearAnchor={(param) => clearAnchorMut.mutate({ param })}
                    onClose={() => setCandleMenu(null)}
                />
            )}
        </div>
    );
}

/**
 * 현재 타점의 파라미터 앵커 칩 — 헤더 배지 줄. 지정된 param 만 뜬다(없으면 아무것도 안 그림).
 * 색은 앵커 선과 같은 것(ANCHOR_LINE_COLOR) — 차트의 그 하늘색 선과 같은 것임을 색으로 잇는다.
 */
function AnchorChips({ anchors }: { anchors: readonly PointAnchor[] }): JSX.Element | null {
    if (anchors.length === 0) return null;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {anchors.map((a) => {
                const where = `${a.anchorDate.slice(5)}${a.anchorTime ? ` ${a.anchorTime.slice(0, 5)}` : ""}${a.market ? ` ${a.market.toUpperCase()}·${a.field}` : ""}`;
                return (
                    <span key={a.param} title={`${anchorParamByKey.get(a.param)?.name ?? a.param} — ${where}`}
                        style={{ fontSize: 10.5, fontWeight: 700, color: ANCHOR_LINE_COLOR, border: `1px solid ${ANCHOR_LINE_COLOR}`, borderRadius: 3, padding: "1px 4px", whiteSpace: "nowrap" }}>
                        {anchorParamByKey.get(a.param)?.name ?? a.param}
                    </span>
                );
            })}
        </span>
    );
}

// 패널별 기본 뷰 — chart-1=일봉, chart-2=분봉, 그 외=둘다. 사용자가 바꾸면 store(영속)가 덮어씀.
function defaultChartView(panelId: string): ChartView {
    return panelId === "chart-1" ? "daily" : panelId === "chart-2" ? "minute" : "both";
}
