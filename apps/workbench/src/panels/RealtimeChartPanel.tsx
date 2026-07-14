import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { fetchWatchlist } from "../api/alerts.js";
import { useChartBundle } from "../lib/useChartBundle.js";
import { deriveMinuteView, deriveDailyView, prevCloseAsOf } from "../lib/derive.js";
import { fmtDateKo } from "../lib/date.js";
import { useStockName } from "../lib/useStockName.js";
import { StockNameCopy } from "../components/StockNameCopy.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";
import { TextToggle, IconToggle, Dot, PaneLabel, EyeIcon, Center } from "./ChartPanelChrome.js";
import type { RenderLine } from "../api/priceLines.js";

// 실시간 차트(실시간 플레인, 실시간 버스) — apps/live 에서 REST 로 ChartBundle 을 받아 렌더.
// 일봉=기준일(오늘) 앵커, 분봉=검색날짜(일봉 봉 클릭 드리프트, ↺ 복귀). 선/고정 토글. 큐레이션 없음, D/M 선은 메모리(Stage3).
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
    const liveLines = useWorkbench((s) => s.liveLines); // 메모리 D/M 선(당일, 영속X)
    const toggleLine = useWorkbench((s) => s.toggleLiveLine);
    const removeLine = useWorkbench((s) => s.removeLiveLine);
    const captureCode = useWorkbench((s) => s.alertCaptureCode); // 알람 가격 캡처 무장 종목
    const deliverAlertPrice = useWorkbench((s) => s.deliverAlertPrice);
    const captureArmed = captureCode != null && captureCode === code; // 이 차트(포커스 종목)가 무장 대상일 때만
    const [view, setView] = useState<ChartView>("both");
    const [showMarkers, setShowMarkers] = useState(true);
    const [showLine, setShowLine] = useState(true); // 검색 세로선 표시
    const [pinMinute, setPinMinute] = useState(false); // 분봉 기준일 고정(일봉 클릭 무시)
    const [showGuide, setShowGuide] = useState(true); // +30% 가이드선(검색일 전일종가 ×1.3)
    const [showAlarmLines, setShowAlarmLines] = useState(true); // 알람 가격조건 선 표시

    const viewDate = pinMinute ? anchorDate : search?.date ?? anchorDate; // 고정 시 기준일 붙박이
    const drifted = viewDate !== anchorDate;

    // 일봉=기준일 앵커(오늘 봉 갱신 폴), 분봉=검색날짜(오늘이면 라이브 폴, 과거면 정적).
    const dailyQ = useChartBundle("live", code, anchorDate, { refetchInterval: 5000 });
    const minuteQ = useChartBundle("live", code, viewDate, { refetchInterval: drifted ? false : 5000 });

    const dailyView = useMemo(() => (dailyQ.data ? deriveDailyView(dailyQ.data, mode) : null), [dailyQ.data, mode]);
    const minuteView = useMemo(() => (minuteQ.data ? deriveMinuteView(minuteQ.data, mode) : null), [minuteQ.data, mode]);
    // 검색일 전일종가(수정주가, mode 시장) — 크로스헤어 위치 %·+30% 가이드선의 base(검색일 고정).
    const pctBase = useMemo(() => (dailyView ? prevCloseAsOf(dailyView, viewDate) : null), [dailyView, viewDate]);
    const expanded: "daily" | "minute" | null = view === "both" ? null : view;
    const toggleExpand = (which: "daily" | "minute"): void => setView(view === which ? "both" : which);

    // 메모리 선 앵커 → 렌더선(로드된 캔들 고가에 해소). anchorTime 있으면 M, 없으면 D.
    const anchors = useMemo(() => liveLines[code] ?? [], [liveLines, code]);
    const resolvedLines = useMemo<RenderLine[]>(() => {
        if (!dailyView || !minuteView) return [];
        const dByDate = new Map(dailyView.map((p) => [p.time, p] as const));
        const mByKey = new Map(minuteView.points.map((p) => [`${p.date}T${p.tradeTime}`, p] as const));
        const out: RenderLine[] = [];
        for (const a of anchors) {
            if (a.anchorTime) {
                const mp = mByKey.get(`${a.anchorDate}T${a.anchorTime}`);
                if (mp) out.push({ id: a.id, price: mp.highPrice, kind: "M" });
            } else {
                const dp = dByDate.get(a.anchorDate);
                if (dp) out.push({ id: a.id, price: dp.high, kind: "D" });
            }
        }
        return out;
    }, [anchors, dailyView, minuteView]);
    const dLines = useMemo(() => resolvedLines.filter((l) => l.kind === "D"), [resolvedLines]);
    // 알람 가격선(빨강 🔔) — 포커스 종목의 가격 조건 값들을 수평선으로. 워치리스트 쿼리(패널과 캐시 공유).
    const wl = useQuery({ queryKey: ["live-watchlist"], queryFn: ({ signal }) => fetchWatchlist(signal), refetchInterval: 5000 });
    const alarmLines = useMemo<RenderLine[]>(() => {
        if (!showAlarmLines) return [];
        const out: RenderLine[] = [];
        for (const r of wl.data?.rules ?? []) {
            if (r.code !== code) continue;
            r.leaves.forEach((l, i) => {
                if (l.kind === "price") out.push({ id: `${r.id}-${i}`, price: l.value, kind: "A" });
            });
        }
        return out;
    }, [wl.data, code, showAlarmLines]);
    const dailyLines = useMemo(() => [...dLines, ...alarmLines], [dLines, alarmLines]);
    const minuteLines = useMemo(() => [...resolvedLines, ...alarmLines], [resolvedLines, alarmLines]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} title="실시간 플레인" />
                <StockNameCopy code={code} name={name} style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }} />
                <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{fmtDateKo(anchorDate)}</span>
                {drifted && (
                    <>
                        <span className="tabular" style={{ color: "#e07b1a", fontWeight: 600 }}>→ {fmtDateKo(viewDate)}</span>
                        <button onClick={() => setSearch(null)} title="기준일로 복귀" style={{ border: "none", background: "none", color: "#e07b1a", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }}>↺</button>
                    </>
                )}
                {!drifted && (dailyQ.isFetching || minuteQ.isFetching) && <span style={{ color: "var(--plane-live)", fontSize: 11, fontWeight: 600 }}>● LIVE</span>}
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                {/* 우상단 경량 컨트롤(보드 헤더 계열) — 뷰 · 선/고정 · 마커/시장. */}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <TextToggle active={view === "daily"} onClick={() => setView("daily")} title="일봉만">일봉</TextToggle>
                        <Dot />
                        <TextToggle active={view === "minute"} onClick={() => setView("minute")} title="분봉만">분봉</TextToggle>
                        <Dot />
                        <TextToggle active={view === "both"} onClick={() => setView("both")} title="둘 다">둘다</TextToggle>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <TextToggle active={showLine} activeColor="var(--accent-primary)" onClick={() => setShowLine((v) => !v)} title={showLine ? "검색 세로선 숨기기" : "검색 세로선 표시"}>선</TextToggle>
                        <TextToggle active={pinMinute} activeColor="var(--accent-primary)" onClick={() => setPinMinute((v) => !v)} title={pinMinute ? "분봉 고정 해제(일봉 클릭 추종)" : "분봉을 기준일에 고정(일봉 클릭 무시)"}>고정</TextToggle>
                        <TextToggle active={showGuide} activeColor="var(--accent-primary)" onClick={() => setShowGuide((v) => !v)} title={showGuide ? "+30% 가이드선 숨기기" : "+30% 가이드선 표시(검색일 전일종가 기준)"}>30%</TextToggle>
                        <TextToggle active={showAlarmLines} activeColor="#dc2626" onClick={() => setShowAlarmLines((v) => !v)} title={showAlarmLines ? "알람 가격선 숨기기" : "알람 가격선 표시"}>알람선</TextToggle>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <IconToggle active={showMarkers} onClick={() => setShowMarkers((v) => !v)} title={showMarkers ? "거래대금 마커 끄기" : "거래대금 마커 켜기"}>
                            <EyeIcon off={!showMarkers} />
                        </IconToggle>
                        <TextToggle active activeColor="var(--accent-primary)" onClick={() => setMode(mode === "un" ? "krx" : "un")} title={`클릭: 시장 전환 (현재 ${mode.toUpperCase()})`}>
                            <span style={{ display: "inline-block", minWidth: 28, textAlign: "center" }}>{mode.toUpperCase()}</span>
                        </TextToggle>
                    </span>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && (dailyQ.isLoading || minuteQ.isLoading) && !dailyView && <Center text={`${code} 로딩중…`} />}
                {(dailyQ.isError || minuteQ.isError) && <Center text="오류 — 재시도 중…" />}
                {dailyView && minuteView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div onDoubleClick={() => toggleExpand("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 클릭: 그날 분봉 · 봉 우클릭: 선">
                                {dailyView.length > 0 ? (
                                    <DailyChart
                                        points={dailyView}
                                        lines={dailyLines}
                                        zoom={chartZoom != null}
                                        zoomBars={cs.dailyZoomBars}
                                        zoomOutBars={cs.dailyZoomOutBars}
                                        onRightClick={(anchorD) => toggleLine(code, { anchorDate: anchorD })}
                                        onRemoveLine={(l) => removeLine(code, l.id)}
                                        onCandleClick={pinMinute ? undefined : (d) => setSearch(d === anchorDate ? null : { date: d })}
                                        onPickPrice={deliverAlertPrice}
                                        capturePriceArmed={captureArmed}
                                        searchDate={showLine && drifted ? viewDate : undefined}
                                        pctBase={pctBase}
                                        showGuide={showGuide}
                                    />
                                ) : (
                                    <Center text="일봉 없음" />
                                )}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggleExpand("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 우클릭: 선">
                                <PaneLabel text={fmtDateKo(viewDate)} />
                                {minuteView.points.length > 0 ? (
                                    <MinuteChart points={minuteView.points} showAmountMarkers={showMarkers} lines={minuteLines} base={minuteView.base} onMovePoint={noop} onRightClick={(a) => toggleLine(code, { anchorDate: a.date, anchorTime: a.time })} onRemoveLine={(l) => removeLine(code, l.id)} onPickPrice={deliverAlertPrice} capturePriceArmed={captureArmed} />
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
