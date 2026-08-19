import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { chartQuery, liveWatchlistQuery } from "../api/queries.js";
import { useChartViews, resolveAnchorLines } from "../lib/chartFrame.js";
import { LIVE_CADENCE_MS } from "../lib/liveCadence.js";
import { optionLabel } from "../lib/predicateUi.js";
import { useStockName } from "../lib/useStockName.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";
import {
    amountMarkerControl,
    Center,
    ChartHeader,
    ChartPanes,
    guideControl,
    marketControl,
    pinControl,
    scaleControl,
    searchLineControl,
    viewControl,
} from "./ChartPanelChrome.js";
import type { ControlSpec } from "../components/HeaderControls.js";
import type { RenderLine } from "../lib/chartFrame.js";
import { ALARM } from "../styles/palette.js";

// 실시간 차트(실시간 플레인) — apps/live 에서 REST 로 ChartBundle 을 받아 렌더. 껍데기는 ChartPanelChrome 공용.
// 일봉=기준일(오늘) 앵커, 분봉=검색날짜(일봉 봉 ctrl+클릭·더블클릭이 드리프트, ↺ 복귀).
// 큐레이션 없음 — D/M 선은 메모리(store liveLines), 여기에 알람 가격선(빨강)과 편집 중 draft 선이 겹쳐 얹힌다.
const noop = (): void => {};

export function RealtimeChartPanel({ panelId }: { panelId: string }): JSX.Element {
    const { code, anchorDate, viewDate: searchDate, setSearchDate } = usePlaneBus("live");
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
    const draftLines = useWorkbench((s) => s.alertDraftLines); // 편집 중 조건의 draft 가격선(미리보기)
    const captureArmed = captureCode != null && captureCode === code; // 이 차트(포커스 종목)가 무장 대상일 때만
    // 헤더 토글 — 패널별 store 영속(usePanelUi). 프리셋 전환(재마운트)·새로고침에 유지.
    const [view, setView] = usePanelUi<ChartView>(panelId, "view", "both");
    const [showMarkers, setShowMarkers] = usePanelUi(panelId, "showMarkers", true);
    const [showLine, setShowLine] = usePanelUi(panelId, "showLine", true); // 검색 세로선 표시
    const [pinMinute, setPinMinute] = usePanelUi(panelId, "pinMinute", false); // 분봉 기준일 고정(일봉 클릭 무시)
    const [lockScale, setLockScale] = usePanelUi(panelId, "lockScale", false); // 분봉 스케일 고정
    const [showGuide, setShowGuide] = usePanelUi(panelId, "showGuide", true); // +30% 가이드선
    const [showAlarmLines, setShowAlarmLines] = usePanelUi(panelId, "showAlarmLines", true); // 알람 가격조건 선 표시

    const viewDate = pinMinute ? anchorDate : searchDate; // 고정 시 기준일 붙박이
    const drifted = viewDate !== anchorDate;
    const expanded: "daily" | "minute" | null = view === "both" ? null : view;

    // 소스는 chartQuery 가 날짜로 고른다(당일=브로커 / 과거=DB). 여기선 **폴링 주기**만 정한다:
    // 일봉=기준일(오늘 형성봉 갱신) 상시 폴, 분봉=검색날짜(오늘이면 폴, 과거로 드리프트했으면 정적).
    const dailyQ = useQuery({ ...chartQuery(code, anchorDate), refetchInterval: LIVE_CADENCE_MS, placeholderData: keepPreviousData });
    const minuteQ = useQuery({ ...chartQuery(code, viewDate), refetchInterval: drifted ? false : LIVE_CADENCE_MS, placeholderData: keepPreviousData });
    const { dailyView, minuteView, dailyFrameKey, minuteFrameKey, pctBase } = useChartViews(dailyQ.data, minuteQ.data, mode, viewDate);

    // 메모리 선 앵커 → 렌더선(로드된 캔들 고가에 해소). 해소 규칙은 복기 가격선과 같은 함수.
    // 전환 과도기 가드 — 선 앵커(store)는 새 종목으로 즉시 갈아타는데 번들은 keepPreviousData 로 직전 종목
    // 것을 잠깐 들고 있다 → 번들이 이 종목의 것일 때만 해소한다(복기 chartAnchorHooks 의 ownBundle 과 같은 규칙).
    const ownDailyView = dailyQ.data?.stockCode === code ? dailyView : null;
    const ownMinuteView = minuteQ.data?.stockCode === code ? minuteView : null;
    const anchors = useMemo(() => liveLines[code] ?? [], [liveLines, code]);
    const resolvedLines = useMemo(() => resolveAnchorLines(anchors, ownDailyView, ownMinuteView), [anchors, ownDailyView, ownMinuteView]);
    const dLines = useMemo(() => resolvedLines.filter((l) => l.kind === "D"), [resolvedLines]);
    // 알람 가격선(빨강 🔔) — 포커스 종목의 가격 조건 값들을 수평선으로. 워치리스트 쿼리(패널과 캐시 공유 — 정의는 api/queries 한 곳).
    const wl = useQuery(liveWatchlistQuery());
    const alarmLines = useMemo<RenderLine[]>(() => {
        if (!showAlarmLines) return [];
        const out: RenderLine[] = [];
        for (const r of wl.data?.rules ?? []) {
            if (r.code !== code) continue;
            r.predicates.forEach((p, i) => {
                // 방향(↑/↓)은 레지스트리 옵션에서 읽는다 — op 의 0/1 이 무슨 뜻인지는 core 만 안다.
                if (p.kind === "price" && p.params.value > 0)
                    out.push({ id: `${r.id}-${i}`, price: p.params.value, kind: "A", label: optionLabel("price", "op", p.params) === "≥" ? "↑" : "↓" });
            });
        }
        return out;
    }, [wl.data, code, showAlarmLines]);
    // 편집 중 draft 가격선(미리보기) — 이 종목 편집 중일 때만. 저장 선과 같은 빨강 화살표.
    const draftRenderLines = useMemo<RenderLine[]>(() => {
        if (!showAlarmLines || draftLines?.code !== code) return [];
        return draftLines.lines.map((l, i) => ({ id: `draft-${i}`, price: l.price, kind: "A", label: l.up ? "↑" : "↓" }));
    }, [draftLines, code, showAlarmLines]);
    const dailyLines = useMemo(() => [...dLines, ...alarmLines, ...draftRenderLines], [dLines, alarmLines, draftRenderLines]);
    const minuteLines = useMemo(() => [...resolvedLines, ...alarmLines, ...draftRenderLines], [resolvedLines, alarmLines, draftRenderLines]);

    // 헤더 컨트롤 선언 — 공통 문구는 ChartPanelChrome 의 공장이 들고, 이 플레인에만 있는 알람선만 여기서.
    const controls = useMemo<ControlSpec[]>(() => [
        viewControl(view, setView),
        pinControl(pinMinute, () => setPinMinute((v) => !v)),
        scaleControl(lockScale, () => setLockScale((v) => !v)),
        amountMarkerControl(showMarkers, () => setShowMarkers((v) => !v)),
        searchLineControl(showLine, () => setShowLine((v) => !v)),
        guideControl(showGuide, () => setShowGuide((v) => !v)),
        {
            kind: "toggle", id: "alarmLines", name: "알람선", group: "마커", activeColor: ALARM,
            help: "이 종목 알람의 가격 조건을 수평선으로", on: showAlarmLines, set: () => setShowAlarmLines((v) => !v),
        },
        marketControl(mode, setMode),
    ], [view, setView, pinMinute, setPinMinute, lockScale, setLockScale, showMarkers, setShowMarkers,
        showLine, setShowLine, showGuide, setShowGuide, showAlarmLines, setShowAlarmLines, mode, setMode]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            <ChartHeader
                plane="live"
                code={code}
                name={name}
                anchorDate={anchorDate}
                viewDate={viewDate}
                drifted={drifted}
                onResetSearch={() => setSearchDate(null)}
                baseFallback={minuteView?.baseFallback}
                controls={controls}
                storageKey="wb.headerPins.chart.live"
                badges={
                    !drifted && (dailyQ.isFetching || minuteQ.isFetching) ? (
                        <span style={{ color: "var(--plane-live)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>● LIVE</span>
                    ) : null
                }
            />

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && (dailyQ.isLoading || minuteQ.isLoading) && !dailyView && <Center text={`${code} 로딩중…`} />}
                {(dailyQ.isError || minuteQ.isError) && <Center text="오류 — 재시도 중…" />}
                {!!code && dailyView && minuteView && (
                    <ChartPanes
                        expanded={expanded}
                        viewDate={viewDate}
                        dailyTitle="봉 ctrl+클릭 / 더블클릭: 그날 분봉 · 봉 우클릭: 선"
                        minuteTitle="봉 우클릭: 선"
                        emptyMinute="분봉 없음 (장 마감?)"
                        daily={
                            dailyView.length > 0 ? (
                                <DailyChart
                                    points={dailyView}
                                    frameKey={dailyFrameKey}
                                    lines={dailyLines}
                                    zoom={chartZoom != null}
                                    zoomBars={cs.dailyZoomBars}
                                    zoomOutBars={cs.dailyZoomOutBars}
                                    onRightClick={(d) => toggleLine(code, { anchorDate: d })}
                                    onRemoveLine={(l) => removeLine(code, l.id)}
                                    onCandleClick={pinMinute ? undefined : (d) => setSearchDate(d === anchorDate ? null : d)}
                                    onPickPrice={deliverAlertPrice}
                                    capturePriceArmed={captureArmed}
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
                                    // f 줌 — 두 차트 동시(chartHooks 의 약속). 라이브는 저장 타점이 없으니 최신 봉 앵커(null).
                                    zoom={chartZoom ? { bars: cs.minuteZoomBars, anchorTime: null } : null}
                                    lockTimeScale={lockScale}
                                    onMovePoint={noop}
                                    onRightClick={(a) => toggleLine(code, { anchorDate: a.date, anchorTime: a.time })}
                                    onRemoveLine={(l) => removeLine(code, l.id)}
                                    onPickPrice={deliverAlertPrice}
                                    capturePriceArmed={captureArmed}
                                />
                            ) : null
                        }
                    />
                )}
            </div>
        </div>
    );
}
