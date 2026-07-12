import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { fetchLiveChart } from "../api/liveChart.js";
import { deriveMinuteView, deriveDailyView } from "../lib/derive.js";
import { useStockName } from "../lib/useStockName.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";
import { SegButton, PaneLabel, EyeIcon, Center } from "./ChartPanelChrome.js";

// 실시간 차트(실시간 플레인) — apps/live 에서 선택 종목의 오늘 ChartBundle 을 5초 폴로 받아 렌더.
// EOD 차트와 렌더(DailyChart/MinuteChart)·derive 는 공유하되 **날짜/시간·큐레이션 주석은 없음**(실시간=종목만 구독).
const noop = (): void => {};

export function RealtimeChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code); // 실시간 = focus.code 만(날짜/시간 미구독)
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const cs = useWorkbench((s) => s.chartSettings);
    const chartZoom = useWorkbench((s) => s.chartZoom);
    const name = useStockName(code);
    const [view, setView] = useState<ChartView>("both");
    const [showMarkers, setShowMarkers] = useState(true);

    const query = useQuery({
        queryKey: ["liveChart", code],
        queryFn: ({ signal }) => fetchLiveChart(code, signal),
        enabled: !!code,
        refetchInterval: 5000, // 5초 폴(장중 라이브 갱신). 패널 닫히면 언마운트→폴 중단.
        refetchOnWindowFocus: false,
    });

    const minuteView = useMemo(() => (query.data ? deriveMinuteView(query.data, mode) : null), [query.data, mode]);
    const dailyView = useMemo(() => (query.data ? deriveDailyView(query.data, mode) : null), [query.data, mode]);
    const expanded: "daily" | "minute" | null = view === "both" ? null : view;
    const toggleExpand = (which: "daily" | "minute"): void => setView(view === which ? "both" : which);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} title="실시간 플레인" />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{name ?? code ?? "—"}</span>
                {name && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>}
                {query.isFetching && <span style={{ color: "var(--plane-live)", fontSize: 11, fontWeight: 600 }}>● LIVE</span>}
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
                {code && query.isLoading && <Center text={`${code} 로딩중…`} />}
                {query.isError && <Center text={`오류: ${(query.error as Error).message}`} />}
                {minuteView && dailyView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div onDoubleClick={() => toggleExpand("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다">
                                <PaneLabel text="일봉" />
                                {dailyView.length > 0 ? (
                                    <DailyChart points={dailyView} lines={[]} zoom={chartZoom != null} zoomBars={cs.dailyZoomBars} zoomOutBars={cs.dailyZoomOutBars} onRightClick={noop} onRemoveLine={noop} />
                                ) : (
                                    <Center text="일봉 없음" />
                                )}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggleExpand("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다">
                                <PaneLabel text="분봉" />
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
