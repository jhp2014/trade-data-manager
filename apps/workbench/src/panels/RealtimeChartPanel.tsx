import { useMemo, useState } from "react";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { useChartBundle } from "../lib/useChartBundle.js";
import { deriveMinuteView, deriveDailyView } from "../lib/derive.js";
import { useStockName } from "../lib/useStockName.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";
import { SegButton, PaneLabel, EyeIcon, Center } from "./ChartPanelChrome.js";

// 실시간 차트(실시간 플레인, 실시간 버스) — apps/live 에서 REST 로 ChartBundle 을 받아 렌더.
// 두 날짜: **일봉=기준일(오늘) 앵커, 분봉=검색날짜**(일봉 봉 클릭이 드리프트, 새로고침으로 기준일 복귀).
// 검색날짜=오늘이면 5초 폴(라이브), 과거면 정적(폴 X). 큐레이션(가격선/타점)은 없음(실시간=종목만). D/M 선은 Stage 3(메모리).
const noop = (): void => {};

export function RealtimeChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.liveFocus.code);
    const anchorDate = useWorkbench((s) => s.liveFocus.date); // 기준일(오늘)
    const search = useWorkbench((s) => s.liveSearch);
    const setSearch = useWorkbench((s) => s.setLiveSearch);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const cs = useWorkbench((s) => s.chartSettings);
    const chartZoom = useWorkbench((s) => s.chartZoom);
    const name = useStockName(code);
    const [view, setView] = useState<ChartView>("both");
    const [showMarkers, setShowMarkers] = useState(true);

    const searchDate = search?.date ?? anchorDate; // 검색날짜(기본=기준일)
    const drifted = searchDate !== anchorDate;

    // 일봉=기준일 앵커(2년, 오늘 봉 갱신 위해 폴), 분봉=검색날짜(오늘이면 라이브 폴, 과거면 정적).
    const dailyQ = useChartBundle("live", code, anchorDate, { refetchInterval: 5000 });
    const minuteQ = useChartBundle("live", code, searchDate, { refetchInterval: drifted ? false : 5000 });

    const dailyView = useMemo(() => (dailyQ.data ? deriveDailyView(dailyQ.data, mode) : null), [dailyQ.data, mode]);
    const minuteView = useMemo(() => (minuteQ.data ? deriveMinuteView(minuteQ.data, mode) : null), [minuteQ.data, mode]);
    const expanded: "daily" | "minute" | null = view === "both" ? null : view;
    const toggleExpand = (which: "daily" | "minute"): void => setView(view === which ? "both" : which);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} title="실시간 플레인" />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{name ?? code ?? "—"}</span>
                {name && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>}
                {/* 기준일 + (드리프트 시) 검색날짜 + 새로고침 */}
                <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{anchorDate.slice(5)}</span>
                {drifted && (
                    <>
                        <span style={{ color: "var(--plane-live)", fontWeight: 600 }}>→ {searchDate.slice(5)}</span>
                        <button onClick={() => setSearch(null)} title="기준일로 복귀" style={{ border: "none", background: "none", color: "var(--plane-live)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }}>↺</button>
                    </>
                )}
                {!drifted && (dailyQ.isFetching || minuteQ.isFetching) && <span style={{ color: "var(--plane-live)", fontSize: 11, fontWeight: 600 }}>● LIVE</span>}
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
                    <SegButton first active={view === "daily"} onClick={() => setView("daily")} title="일봉만">Day</SegButton>
                    <SegButton active={view === "minute"} onClick={() => setView("minute")} title="분봉만">Min</SegButton>
                    <SegButton active={view === "both"} onClick={() => setView("both")} title="둘 다">Day·Min</SegButton>
                </div>
                <div style={{ marginLeft: 6, display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
                    <SegButton first active={showMarkers} onClick={() => setShowMarkers((v) => !v)} title={showMarkers ? "거래대금 마커 끄기" : "거래대금 마커 켜기"}>
                        <EyeIcon off={!showMarkers} />
                    </SegButton>
                    <SegButton active onClick={() => setMode(mode === "un" ? "krx" : "un")} title={`클릭: 시장 전환 (현재 ${mode.toUpperCase()})`}>
                        <span style={{ fontWeight: 600, minWidth: 30, textAlign: "center" }}>{mode.toUpperCase()}</span>
                    </SegButton>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && (dailyQ.isLoading || minuteQ.isLoading) && !dailyView && <Center text={`${code} 로딩중…`} />}
                {(dailyQ.isError || minuteQ.isError) && <Center text="오류 — 재시도 중…" />}
                {dailyView && minuteView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div onDoubleClick={() => toggleExpand("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 클릭: 그날 분봉 탐색">
                                <PaneLabel text="일봉" />
                                {dailyView.length > 0 ? (
                                    <DailyChart
                                        points={dailyView}
                                        lines={[]}
                                        zoom={chartZoom != null}
                                        zoomBars={cs.dailyZoomBars}
                                        zoomOutBars={cs.dailyZoomOutBars}
                                        onRightClick={noop}
                                        onRemoveLine={noop}
                                        onCandleClick={(d) => setSearch(d === anchorDate ? null : { date: d })}
                                        searchDate={drifted ? searchDate : undefined}
                                    />
                                ) : (
                                    <Center text="일봉 없음" />
                                )}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggleExpand("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다">
                                <PaneLabel text={drifted ? `분봉 · ${searchDate.slice(5)}` : "분봉"} />
                                {minuteView.points.length > 0 ? (
                                    <MinuteChart points={minuteView.points} showAmountMarkers={showMarkers} lines={[]} base={minuteView.base} onMovePoint={noop} onRightClick={noop} onRemoveLine={noop} />
                                ) : (
                                    <Center text={mode === "krx" ? "KRX 분봉 없음" : "분봉 없음 (장 마감?)"} />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
