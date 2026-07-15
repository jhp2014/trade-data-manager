import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { chartQuery } from "../api/queries.js";
import { deriveMinuteView, deriveDailyView, prevCloseAsOf, kstToUnix } from "../lib/derive.js";
import { usePriceLinesForChart, useReviewPointData } from "../lib/chartHooks.js";
import { useStockName } from "../lib/useStockName.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";
import { MarkerGroup, PaneLabel, Center } from "./ChartPanelChrome.js";
import { TextToggle, Dot, Sep, ControlGroup, ControlBar } from "../components/ControlChrome.js";
import { StockNameCopy } from "../components/StockNameCopy.js";
import { fmtDateKo } from "../lib/date.js";

// 차트 패널 — 일봉(상) + 분봉(하) 듀얼. 영역 전환(일봉만/분봉만/둘다)은 헤더 뷰 토글.
// 좌상단 종목명(마스터 메타 경량 조회), 우상단 통합 세그먼트 컨트롤(마커·타점정보·clear·시장).
// 가격선/타점 편집 유스케이스는 usePriceLinesForChart·useReviewPointHotkeys 훅으로 분리 — 여긴 뷰 파생+렌더.
// code/date/time 은 Focus 구독. 분봉 ctrl+클릭·더블클릭=타점 이동, 스페이스바=타점 저장(토글), 숫자키 1~9=유형 프리셋 입력.
export function ChartPanel({ panelId }: { panelId: string }): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const anchor = useWorkbench((s) => s.focus.date); // 기준일(앵커) — 일봉 pane 중심
    const search = useWorkbench((s) => s.search);
    const time = useWorkbench((s) => s.focus.time);
    const setTime = useWorkbench((s) => s.setTime);
    const setSearch = useWorkbench((s) => s.setSearch);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const cs = useWorkbench((s) => s.chartSettings);
    const chartZoom = useWorkbench((s) => s.chartZoom); // f 줌(전역 — 두 차트 동시 확대/축소)
    const view = useWorkbench((s) => s.chartViews[panelId]) ?? defaultChartView(panelId); // 일봉만/분봉만/일봉+분봉(패널별·영속)
    const setChartView = useWorkbench((s) => s.setChartView);
    const setView = (v: ChartView): void => setChartView(panelId, v);
    const collapsed = useWorkbench((s) => s.panelControlsCollapsed[panelId]) ?? false; // 컨트롤 바 접힘(패널별·영속)
    const toggleControls = useWorkbench((s) => s.togglePanelControls);
    const expanded: "daily" | "minute" | null = view === "both" ? null : view; // 기존 렌더 로직 재사용
    const [showMarkers, setShowMarkers] = useState(true); // 분봉 거래대금 마커 ON/OFF
    const [showPointInfo, setShowPointInfo] = useState(true); // 현재 타점(시간선) readout — 기본 표시
    const [showLine, setShowLine] = useState(true); // 검색 세로선 표시
    const [pinMinute, setPinMinute] = useState(false); // 분봉 기준일 고정(일봉 클릭 무시)
    const [showGuide, setShowGuide] = useState(true); // +30% 가이드선(검색일 전일종가 ×1.3)

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)
    // 두 날짜: 일봉=기준일(앵커, 2년), 분봉·큐레이션=검색날짜(기본=기준일, 일봉 봉 클릭이 드리프트). 고정 시 기준일 붙박이. search=null 이면 viewDate=anchor 로 동작 무변경.
    const viewDate = pinMinute ? anchor : search?.date ?? anchor;
    const drifted = viewDate !== anchor;
    const dailyQ = useQuery(chartQuery(code, anchor));
    const minuteQ = useQuery(chartQuery(code, viewDate)); // viewDate=anchor 면 같은 쿼리(RQ dedup)

    const dailyView = useMemo(() => (dailyQ.data ? deriveDailyView(dailyQ.data, mode) : null), [dailyQ.data, mode]);
    const minuteView = useMemo(() => (minuteQ.data ? deriveMinuteView(minuteQ.data, mode) : null), [minuteQ.data, mode]);
    // 검색일 전일종가(수정주가, mode 시장) — 크로스헤어 위치 %·+30% 가이드선의 base(검색일 고정).
    const pctBase = useMemo(() => (dailyView ? prevCloseAsOf(dailyView, viewDate) : null), [dailyView, viewDate]);

    // 가격선 주석(조회·해소·토글/삭제/clear) + 복기 타점(조회·단축키·savedPoints) — 훅으로 분리.
    const { resolvedLines, dLines, hasLines, toggleLine, removeLine, clear } = usePriceLinesForChart(code, viewDate, dailyView, minuteView);
    const { savedPoints, focusedPoint } = useReviewPointData(code, viewDate, time);

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음. 검색날짜(viewDate) 기준. (단축키는 전역 useChartHotkeys)
    const markerTime = useMemo(() => (time && viewDate ? kstToUnix(viewDate, time) : null), [time, viewDate]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <StockNameCopy code={code} name={name} style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", flexShrink: 0 }} />
                <span className="tabular" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDateKo(anchor)}</span>
                {drifted && (
                    <>
                        <span className="tabular" style={{ color: "#e07b1a", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>→ {fmtDateKo(viewDate)}</span>
                        <button onClick={() => setSearch(null)} title="기준일로 복귀" aria-label="기준일로 복귀" style={{ border: "none", background: "none", color: "#e07b1a", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>↺</button>
                    </>
                )}
                {focusedPoint?.type && <span style={{ padding: "1px 6px", borderRadius: 4, background: "var(--accent-soft)", color: "var(--accent-hover)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }} title="현재 타점 셋업 유형">{focusedPoint.type}</span>}
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                {/* 우상단 경량 컨트롤 — 뷰 │ 동작 │ 마커 │ 시장. 통째로 접힘(패널별), 폭 부족 시 가로 휠. */}
                <ControlBar collapsed={collapsed} onToggle={() => toggleControls(panelId)}>
                    {/* 뷰 — 일봉만/분봉만/일봉+분봉(패널별 독립, 상호배타). */}
                    <ControlGroup gap={1}>
                        <TextToggle active={view === "daily"} onClick={() => setView("daily")} title="일봉만">일봉</TextToggle>
                        <Dot />
                        <TextToggle active={view === "minute"} onClick={() => setView("minute")} title="분봉만">분봉</TextToggle>
                        <Dot />
                        <TextToggle active={view === "both"} onClick={() => setView("both")} title="일봉+분봉 둘 다">일봉+분봉</TextToggle>
                    </ControlGroup>
                    <Sep />
                    {/* 동작 — 마커가 아닌 on/off. */}
                    <ControlGroup>
                        <TextToggle active={pinMinute} activeColor="var(--accent-primary)" onClick={() => setPinMinute((v) => !v)} title={pinMinute ? "분봉 고정 해제(일봉 클릭 추종)" : "분봉을 기준일에 고정(일봉 클릭 무시)"}>고정</TextToggle>
                        <TextToggle active={showPointInfo} activeColor="var(--accent-primary)" onClick={() => setShowPointInfo((v) => !v)} title={showPointInfo ? "현재 타점 정보 끄기" : "현재 타점 정보 켜기"}>타점정보</TextToggle>
                    </ControlGroup>
                    <Sep />
                    {/* 마커 — 차트에 얹히는 표시들. 한 덩어리(배경)로 묶고 라벨은 그룹에 1회. */}
                    <MarkerGroup>
                        <TextToggle active={showMarkers} activeColor="var(--accent-primary)" onClick={() => setShowMarkers((v) => !v)} title={showMarkers ? "분봉 거래대금 마커 끄기" : "분봉 거래대금 마커 켜기"}>분봉 대금</TextToggle>
                        <TextToggle active={showLine} activeColor="var(--accent-primary)" onClick={() => setShowLine((v) => !v)} title={showLine ? "검색 날짜 세로선 숨기기" : "검색 날짜 세로선 표시"}>검색 날짜</TextToggle>
                        <TextToggle active={showGuide} activeColor="var(--accent-primary)" onClick={() => setShowGuide((v) => !v)} title={showGuide ? "+30% 가이드선 숨기기" : "+30% 가이드선 표시(검색일 전일종가 기준)"}>30%</TextToggle>
                    </MarkerGroup>
                    <Sep />
                    {/* 가격선 액션 · 시장(UN/KRX 단일 토글). */}
                    <ControlGroup>
                        <TextToggle active={false} disabled={!hasLines} onClick={() => hasLines && clear()} title="가격선 전체 지우기">선 지우기</TextToggle>
                        <TextToggle active activeColor="var(--accent-primary)" onClick={() => setMode(mode === "un" ? "krx" : "un")} title={`클릭: 시장 전환 (현재 ${mode.toUpperCase()})`}>
                            <span style={{ display: "inline-block", minWidth: 28, textAlign: "center" }}>{mode.toUpperCase()}</span>
                        </TextToggle>
                    </ControlGroup>
                </ControlBar>
            </div>

            {/* 본문 */}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && (dailyQ.isLoading || minuteQ.isLoading) && !dailyView && <Center text={`${code} 로딩중…`} />}
                {(dailyQ.isError || minuteQ.isError) && <Center text="오류 — 재시도 중…" />}
                {minuteView && dailyView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div style={{ flex: 1, minHeight: 0, position: "relative" }} title="봉 ctrl+클릭 / 더블클릭: 그 날짜로 검색 · 봉 우클릭: 고점 선(D)">
                                {dailyView.length > 0 ? <DailyChart points={dailyView} lines={dLines} zoom={chartZoom != null} zoomBars={cs.dailyZoomBars} zoomOutBars={cs.dailyZoomOutBars} onRightClick={(anchorDate) => toggleLine(anchorDate, undefined)} onRemoveLine={removeLine} onCandleClick={pinMinute ? undefined : (d) => code && setSearch(d === anchor ? null : { code, date: d })} searchDate={showLine && drifted ? viewDate : undefined} pctBase={pctBase} showGuide={showGuide} /> : <Center text="일봉 없음" />}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div style={{ flex: 1, minHeight: 0, position: "relative" }} title="ctrl+클릭 / 더블클릭: 타점 이동 · 스페이스바: 타점 저장 · 봉 우클릭: 선(M)">
                                <PaneLabel text={fmtDateKo(viewDate)} />
                                {minuteView.points.length > 0 ? (
                                    <MinuteChart
                                        points={minuteView.points}
                                        showAmountMarkers={showMarkers}
                                        lines={resolvedLines}
                                        base={minuteView.base}
                                        markerTime={markerTime}
                                        savedPoints={savedPoints}
                                        showPointInfo={showPointInfo}
                                        zoom={chartZoom ? { bars: cs.minuteZoomBars, anchorTime: chartZoom.anchor } : null}
                                        onMovePoint={(t) => setTime(t)}
                                        onRightClick={(a) => toggleLine(a.date, a.time)}
                                        onRemoveLine={removeLine}
                                    />
                                ) : (
                                    <Center text={mode === "krx" ? "KRX 분봉 없음" : "분봉 없음"} />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// 패널별 기본 뷰 — chart-1=일봉, chart-2=분봉, 그 외=둘다. 사용자가 바꾸면 store(영속)가 덮어씀.
function defaultChartView(panelId: string): ChartView {
    return panelId === "chart-1" ? "daily" : panelId === "chart-2" ? "minute" : "both";
}
