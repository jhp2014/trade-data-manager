import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { chartQuery } from "../api/queries.js";
import { kstToUnix } from "../lib/derive.js";
import { useChartViews } from "../lib/chartFrame.js";
import { usePriceLinesForChart, useReviewPointData } from "../lib/chartHooks.js";
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

    // 가격선 주석(조회·해소·토글/삭제/clear) + 복기 타점(조회·savedPoints) — 훅으로 분리.
    const { resolvedLines, dLines, hasLines, toggleLine, removeLine, clear } = usePriceLinesForChart(code, viewDate, dailyView, minuteView);
    const { savedPoints, focusedPoint, axisTotal } = useReviewPointData(code, viewDate, time);

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음. 검색날짜(viewDate) 기준.
    const markerTime = useMemo(() => (time && viewDate ? kstToUnix(viewDate, time) : null), [time, viewDate]);

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
                        // 현재 타점의 태그(옛 단일 type 배지 자리) — 헤더 한 줄이라 wrap 없이 잘린다.
                        <TagChips tags={tagsOf({ stockCode: code, date: viewDate, time: focusedPoint.time })} style={{ maxWidth: 180, flexShrink: 1 }} />
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
                        dailyTitle="봉 ctrl+클릭 / 더블클릭: 그 날짜로 검색 · 봉 우클릭: 고점 선(D)"
                        minuteTitle="ctrl+클릭 / 더블클릭: 타점 이동 · 스페이스바: 타점 저장 · 봉 우클릭: 선(M)"
                        daily={
                            dailyView.length > 0 ? (
                                <DailyChart
                                    points={dailyView}
                                    frameKey={dailyFrameKey}
                                    lines={dLines}
                                    zoom={chartZoom != null}
                                    zoomBars={cs.dailyZoomBars}
                                    zoomOutBars={cs.dailyZoomOutBars}
                                    onRightClick={(d) => toggleLine(d, undefined)}
                                    onRemoveLine={removeLine}
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
                                    lines={resolvedLines}
                                    base={minuteView.base}
                                    pctBase={pctBase}
                                    markerTime={markerTime}
                                    savedPoints={savedPoints}
                                    axisTotal={axisTotal}
                                    showPointInfo={showPointInfo}
                                    zoom={chartZoom ? { bars: cs.minuteZoomBars, anchorTime: chartZoom.anchor } : null}
                                    lockTimeScale={lockScale}
                                    onMovePoint={(t) => setTime(t)}
                                    onRightClick={(a) => toggleLine(a.date, a.time)}
                                    onRemoveLine={removeLine}
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
        </div>
    );
}

// 패널별 기본 뷰 — chart-1=일봉, chart-2=분봉, 그 외=둘다. 사용자가 바꾸면 store(영속)가 덮어씀.
function defaultChartView(panelId: string): ChartView {
    return panelId === "chart-1" ? "daily" : panelId === "chart-2" ? "minute" : "both";
}
