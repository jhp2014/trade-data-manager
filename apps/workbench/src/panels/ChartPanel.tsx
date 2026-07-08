import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { chartQuery } from "../api/queries.js";
import { deriveMinuteView, deriveDailyView, kstToUnix } from "../lib/derive.js";
import { usePriceLinesForChart, useReviewPointHotkeys, useChartNavHotkeys } from "../lib/chartHooks.js";
import { useStockName } from "../lib/useStockName.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";
import { SegButton, PaneLabel, EyeIcon, InfoIcon, TrashIcon, Center } from "./ChartPanelChrome.js";

// 차트 패널 — 일봉(상) + 분봉(하) 듀얼. 영역 더블클릭 = 그 영역만 보기 ↔ 둘 다.
// 좌상단 종목명(마스터 메타 경량 조회), 우상단 통합 세그먼트 컨트롤(마커·타점정보·clear·시장).
// 가격선/타점 편집 유스케이스는 usePriceLinesForChart·useReviewPointHotkeys 훅으로 분리 — 여긴 뷰 파생+렌더.
// code/date/time 은 Focus 구독. 분봉 좌클릭=타점 이동, 스페이스바=타점 저장(토글), 숫자키 1~9=유형 프리셋 입력.
export function ChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const time = useWorkbench((s) => s.focus.time);
    const setTime = useWorkbench((s) => s.setTime);
    const setSearch = useWorkbench((s) => s.setSearch);
    const typePresets = useWorkbench((s) => s.reviewTypePresets);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const cs = useWorkbench((s) => s.chartSettings);
    const [expanded, setExpanded] = useState<"daily" | "minute" | null>(null);
    const [showMarkers, setShowMarkers] = useState(true); // 분봉 거래대금 마커 ON/OFF
    const [showPointInfo, setShowPointInfo] = useState(false); // 현재 타점 정보 박스 토글
    const [zoom, setZoom] = useState<{ anchor: number | null } | null>(null); // f 줌(일봉+분봉). anchor=줌 시작 시각(분봉 중심)

    const query = useQuery(chartQuery(code, date));
    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)

    const minuteView = useMemo(() => (query.data ? deriveMinuteView(query.data, mode) : null), [query.data, mode]);
    const dailyView = useMemo(() => (query.data ? deriveDailyView(query.data, mode) : null), [query.data, mode]);

    const toggleExpand = (which: "daily" | "minute"): void => setExpanded((cur) => (cur === which ? null : which));

    // 가격선 주석(조회·해소·토글/삭제/clear) + 복기 타점(조회·단축키·savedTimes) — 훅으로 분리.
    const { resolvedLines, dLines, hasLines, toggleLine, removeLine, clear } = usePriceLinesForChart(code, date, dailyView, minuteView);
    const { savedTimes, focusedPoint } = useReviewPointHotkeys(code, date, time, typePresets);

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음.
    const markerTime = useMemo(() => (time && date ? kstToUnix(date, time) : null), [time, date]);

    // 이동/줌 단축키 — a/d·shift·ctrl·f. f = 줌 토글(현재 시각 중심). 전역 등록(입력창 가드).
    const toggleZoom = (): void => setZoom((z) => (z ? null : { anchor: markerTime }));
    useChartNavHotkeys(code, date, minuteView?.points ?? [], time, cs.jumpBars, toggleZoom);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{name ?? code ?? "—"}</span>
                {name && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>}
                <span style={{ color: "var(--text-tertiary)" }}>{date}</span>
                {focusedPoint?.type && <span style={{ padding: "1px 6px", borderRadius: 4, background: "var(--accent-soft)", color: "var(--accent-hover)", fontSize: 11, fontWeight: 600 }} title="현재 타점 셋업 유형">{focusedPoint.type}</span>}
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                {/* 통합 세그먼트 컨트롤 — 마커·타점정보·clear·시장(UN/KRX 단일 토글) */}
                <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
                    <SegButton first active={showMarkers} onClick={() => setShowMarkers((v) => !v)} title={showMarkers ? "거래대금 마커 끄기" : "거래대금 마커 켜기"}>
                        <EyeIcon off={!showMarkers} />
                    </SegButton>
                    <SegButton active={showPointInfo} onClick={() => setShowPointInfo((v) => !v)} title={showPointInfo ? "현재 타점 정보 끄기" : "현재 타점 정보 켜기"}>
                        <InfoIcon />
                    </SegButton>
                    <SegButton active={false} disabled={!hasLines} onClick={() => hasLines && clear()} title="가격선 전체 지우기">
                        <TrashIcon />
                    </SegButton>
                    <SegButton active onClick={() => setMode(mode === "un" ? "krx" : "un")} title={`클릭: 시장 전환 (현재 ${mode.toUpperCase()})`}>
                        <span style={{ fontWeight: 600, minWidth: 30, textAlign: "center" }}>{mode.toUpperCase()}</span>
                    </SegButton>
                </div>
            </div>

            {/* 본문 */}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && query.isLoading && <Center text={`${code} 로딩중…`} />}
                {query.isError && <Center text={`오류: ${(query.error as Error).message}`} />}
                {minuteView && dailyView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div onDoubleClick={() => toggleExpand("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 우클릭: 고점 선(D)">
                                <PaneLabel text="일봉" />
                                {dailyView.length > 0 ? <DailyChart points={dailyView} lines={dLines} zoom={zoom != null} zoomBars={cs.dailyZoomBars} zoomOutBars={cs.dailyZoomOutBars} onRightClick={(anchorDate) => toggleLine(anchorDate, undefined)} onRemoveLine={removeLine} onCandleClick={(d) => code && setSearch({ code, date: d })} /> : <Center text="일봉 없음" />}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggleExpand("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 좌클릭: 타점 이동 · 스페이스바: 타점 저장 · 봉 우클릭: 선(M)">
                                <PaneLabel text="분봉" />
                                {minuteView.points.length > 0 ? (
                                    <MinuteChart
                                        points={minuteView.points}
                                        showAmountMarkers={showMarkers}
                                        lines={resolvedLines}
                                        base={minuteView.base}
                                        markerTime={markerTime}
                                        savedTimes={savedTimes}
                                        showPointInfo={showPointInfo}
                                        zoom={zoom ? { bars: cs.minuteZoomBars, anchorTime: zoom.anchor } : null}
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
