import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { chartQuery } from "../api/queries.js";
import { kstToUnix } from "../lib/derive.js";
import { useChartViews } from "../lib/chartFrame.js";
import { useReviewPointData } from "../lib/chartHooks.js";
import { useBaselineLines, useDailySkeleton, useIgnoreCandles, useMinuteSkeleton } from "../lib/chartAnchorHooks.js";
import { CandleMenu, type MenuBar } from "../chart/CandleMenu.js";
import type { RenderLine } from "../lib/chartFrame.js";
import { useStockName } from "../lib/useStockName.js";
import { useGroups } from "../lib/GroupsContext.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { GroupChips } from "../components/GroupChips.js";
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
import { SKELETON } from "../styles/palette.js";

// 차트 패널(복기 플레인) — 일봉(상) + 분봉(하) 듀얼. 껍데기(헤더·2단·토글)는 ChartPanelChrome 공용.
// 소스는 chartQuery(DB) — useChartHotkeys·RankFilterPanel 과 **같은 RQ 키**라 캐시를 공유한다(중복 페치 0).
// 차트 앵커 편집은 chartAnchorHooks(param 하나 = 훅 하나), 타점 조회는 useReviewPointData — 여긴 뷰 파생+렌더.
// 선 = 기준선 후보(차트 소유) — 타점 선택 없이 긋고 지운다. 확정 기준선(가격 최저)은 하늘색으로 표시.
// 분봉 ctrl+클릭·더블클릭=타점 이동, 스페이스바=타점 저장(토글) — 전역 useChartHotkeys.
// 그룹 편집 입구는 골격 패널뿐(BulkGroupMenu) — 차트는 결과 칩(GroupChips)만 보여준다.
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
    const [showSkeleton, setShowSkeleton] = usePanelUi(panelId, "showSkeleton", true); // 골격 오버레이(거래대금 마커식 on/off)
    // 우클릭 메뉴의 기준 시장 — 선·골격이 함께 따른다. 패널에 남겨(sticky) 오염 회피로 KRX 를 보는 중에
    // 봉마다 다시 누르지 않게 한다. 분봉·KRX 부재 봉에서는 메뉴가 UN 으로 되돌린다(없는 시장은 못 지목).
    const [menuMarket, setMenuMarket] = usePanelUi<"un" | "krx">(panelId, "menuMarket", "un");

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)
    const { groupsOf, pathLabel } = useGroups();
    // 두 날짜: 일봉=기준일(앵커, 2년), 분봉·큐레이션=검색날짜(기본=기준일, 일봉 봉 클릭이 드리프트). 고정 시 기준일 붙박이.
    const viewDate = pinMinute ? anchorDate : searchDate;
    const drifted = viewDate !== anchorDate;
    // keepPreviousData: 전환 중 직전 번들 유지 — 차트가 로딩으로 언마운트되지 않아 뷰 상태(스케일 고정)가 보존.
    const dailyQ = useQuery({ ...chartQuery(code, anchorDate), placeholderData: keepPreviousData });
    const minuteQ = useQuery({ ...chartQuery(code, viewDate), placeholderData: keepPreviousData }); // viewDate=anchor 면 같은 쿼리(RQ dedup)
    const { dailyView, minuteView, dailyFrameKey, minuteFrameKey, pctBase } = useChartViews(dailyQ.data, minuteQ.data, mode, viewDate);

    // 차트 앵커 편집 — param 하나 = 훅 하나(chartAnchorHooks). 같은 쿼리 키라 왕복은 하나(RQ dedup).
    const lines = useBaselineLines(code, viewDate, dailyQ.data, minuteQ.data);
    const ignore = useIgnoreCandles(code, viewDate);
    const dailySkeleton = useDailySkeleton(code, viewDate, dailyQ.data);
    const { savedPoints, focusedPoint, axisTotal } = useReviewPointData(code, viewDate, time);
    // 분봉 골격도 차트 소유 — 타점 없이도 그 날의 장중 경로를 찍는다(타점별 상한은 읽기 절단의 몫).
    const minuteSkeleton = useMinuteSkeleton(code, viewDate, minuteQ.data);

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음. 검색날짜(viewDate) 기준.
    const markerTime = useMemo(() => (time && viewDate ? kstToUnix(viewDate, time) : null), [time, viewDate]);

    const dailyLines = lines.dLines;
    const minuteLines = lines.resolvedLines;

    // ── 봉 우클릭 메뉴 — 선 긋기(시장×값)와 무시 캔들 토글이 한자리에. 선 근처 우클릭은 삭제 항목만.
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
                        // 현재 타점의 그룹(옛 단일 type 배지 자리) — 헤더 한 줄이라 wrap 없이 잘린다.
                        // 옛 앵커 칩은 제거 — 앵커가 차트 소유가 되면서 선이 상시 그려지므로 별도 단서가 필요 없다.
                        <GroupChips groups={groupsOf({ stockCode: code, date: viewDate, time: focusedPoint.time })} pathOf={(id) => pathLabel(id, "(지워짐)")} style={{ maxWidth: 180, flexShrink: 1 }} />
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
                    <TextToggle active={showSkeleton} activeColor={SKELETON} onClick={() => setShowSkeleton((v) => !v)} title={showSkeleton ? "골격 선 숨기기" : "골격 선 보이기"}>골격</TextToggle>
                </MarkerGroup>
                <Sep />
                <ControlGroup>
                    <TextToggle active={false} disabled={!lines.hasLines} onClick={() => lines.hasLines && lines.clear()} title="가격선 전체 지우기">선 지우기</TextToggle>
                    <TextToggle active={false} disabled={!dailySkeleton.hasAny} onClick={() => dailySkeleton.hasAny && dailySkeleton.clear()} title="일봉 골격 점 전체 지우기(다시 찍기)">골격 지우기</TextToggle>
                    <TextToggle active={false} disabled={!minuteSkeleton.hasAny} onClick={() => minuteSkeleton.hasAny && minuteSkeleton.clear()} title="이 차트의 분봉 골격 점 전체 지우기">분봉골격 지우기</TextToggle>
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
                        dailyTitle="봉 ctrl+클릭 / 더블클릭: 그 날짜로 검색 · 봉 우클릭: 메뉴(선 긋기·무시 캔들)"
                        minuteTitle="ctrl+클릭 / 더블클릭: 타점 이동 · 스페이스바: 타점 저장 · 봉 우클릭: 메뉴(선 긋기)"
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
                                    onRemoveLine={(l) => lines.removeLineById(l.id)}
                                    onLineContext={(l, at) => setCandleMenu({ ...at, nearLine: l })}
                                    onCandleClick={pinMinute ? undefined : (d) => setSearchDate(d === anchorDate ? null : d)}
                                    searchDate={showLine && drifted ? viewDate : undefined}
                                    pctBase={pctBase}
                                    showGuide={showGuide}
                                    ignoredDates={ignore.ignoredDates}
                                    skeleton={dailySkeleton.points}
                                    showSkeleton={showSkeleton}
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
                                    onRemoveLine={(l) => lines.removeLineById(l.id)}
                                    onLineContext={(l, at) => setCandleMenu({ ...at, nearLine: l })}
                                    groupsOfTime={(t) => groupsOf({ stockCode: code, date: viewDate, time: t })}
                                    skeleton={minuteSkeleton.points}
                                    showSkeleton={showSkeleton}
                                />
                            ) : null
                        }
                    />
                )}
            </div>

            {candleMenu && (
                <CandleMenu
                    anchor={{ x: candleMenu.x, y: candleMenu.y }}
                    candle={candleMenu.candle}
                    bars={menuBars}
                    nearLine={candleMenu.nearLine}
                    market={menuMarket}
                    onMarketChange={setMenuMarket}
                    lines={{
                        idAtCandle: candleMenu.candle ? lines.lineIdAt(candleMenu.candle.date, candleMenu.candle.time) : undefined,
                        onAdd: (field, market) => candleMenu.candle && lines.addLine(candleMenu.candle.date, candleMenu.candle.time, field, market),
                        onRemove: lines.removeLineById,
                    }}
                    ignore={{
                        on: candleMenu.candle ? ignore.ignoredDates.includes(candleMenu.candle.date) : false,
                        onToggle: () => candleMenu.candle && ignore.toggleIgnore(candleMenu.candle.date),
                    }}
                    dailySkeleton={{
                        pivots: candleMenu.candle && !candleMenu.candle.time ? dailySkeleton.pivotsAt(candleMenu.candle.date) : [],
                        onToggle: (field, market) => candleMenu.candle && dailySkeleton.toggle(candleMenu.candle.date, field, market),
                    }}
                    minuteSkeleton={{
                        pivots: candleMenu.candle?.time ? minuteSkeleton.pivotsAt(candleMenu.candle.time) : [],
                        onToggle: (field) => candleMenu.candle?.time && minuteSkeleton.toggle(candleMenu.candle.time, field, "un"),
                    }}
                    onClose={() => setCandleMenu(null)}
                />
            )}
        </div>
    );
}

// 패널별 기본 뷰 — chart-1=일봉, chart-2=분봉, 그 외=둘다. 사용자가 바꾸면 store(영속)가 덮어씀.
function defaultChartView(panelId: string): ChartView {
    return panelId === "chart-1" ? "daily" : panelId === "chart-2" ? "minute" : "both";
}
