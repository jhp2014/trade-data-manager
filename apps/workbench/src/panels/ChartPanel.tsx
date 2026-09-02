import { useMemo, useState } from "react";
import { useWorkbench, type ChartView } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { usePlaneBus } from "../store/usePlaneBus.js";
import { useChartBundle } from "../lib/useChartBundle.js";
import { kstToUnix } from "../lib/derive.js";
import { useChartViews } from "../lib/chartFrame.js";
import { autoPointsOfChart, useAutoPoints, usePointGrids } from "../lib/PointGridsContext.js";
import { legHighOf, minuteToHms } from "@trade-data-manager/market/domain";
import type { AutoPointInput } from "../chart/minuteOverlays.js";
import { ownBundle, useAnchorMarks, useBaselineLines, useIgnoreCandles } from "../lib/chartAnchorHooks.js";
import { CandleMenu, type MenuBar } from "../chart/CandleMenu.js";
import type { RenderLine } from "../lib/chartFrame.js";
import { useStockName } from "../lib/useStockName.js";
import { useGroups } from "../lib/GroupsContext.js";
import { usePresenceOf } from "../lib/usePresence.js";
import { PresenceBadges } from "../components/PresenceBadges.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { GroupChips } from "../components/GroupChips.js";
import { DailyChart } from "../chart/DailyChart.js";
import {
    amountMarkerControl,
    anchorMarkControl,
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

// 차트 패널(복기 플레인) — 일봉(상) + 분봉(하) 듀얼. 껍데기(헤더·2단·토글)는 ChartPanelChrome 공용.
// 소스는 chartQuery(DB) — useChartHotkeys·RankFilterPanel 과 **같은 RQ 키**라 캐시를 공유한다(중복 페치 0).
// 차트 앵커 편집은 chartAnchorHooks(param 하나 = 훅 하나), 타점 조회는 useReviewPointData — 여긴 뷰 파생+렌더.
// 선 = 기준선 후보(차트 소유) — 타점 선택 없이 긋고 지운다. 확정 기준선(가격 최저)은 하늘색으로 표시.
// 분봉 ctrl+클릭·더블클릭=시각 이동, ctrl+a/d=자동 타점 순회 — 전역 useChartHotkeys.
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
    const expanded: "daily" | "minute" | null = view === "both" ? null : view;
    // 헤더 토글 — 패널별 store 영속(usePanelUi). 프리셋 전환(재마운트)·새로고침에 유지.
    const [showMarkers, setShowMarkers] = usePanelUi(panelId, "showMarkers", true); // 분봉 거래대금 마커 ON/OFF
    const [showPointInfo, setShowPointInfo] = usePanelUi(panelId, "showPointInfo", true); // 현재 타점(시간선) readout — 기본 표시
    const [showLine, setShowLine] = usePanelUi(panelId, "showLine", true); // 검색 세로선 표시
    const [pinMinute, setPinMinute] = usePanelUi(panelId, "pinMinute", false); // 분봉 기준일 고정(일봉 클릭 무시)
    const [lockScale, setLockScale] = usePanelUi(panelId, "lockScale", false); // 분봉 스케일 고정
    const [showGuide, setShowGuide] = usePanelUi(panelId, "showGuide", true); // +30% 가이드선(검색일 전일종가 ×1.3)
    const [showAnchorMarks, setShowAnchorMarks] = usePanelUi(panelId, "showAnchorMarks", true); // 상단 앵커 표식(칩+드롭선)
    // 우클릭 메뉴의 기준 시장 — 선 줄이 따른다. 패널에 남겨(sticky) 오염 회피로 KRX 를 보는 중에
    // 봉마다 다시 누르지 않게 한다. 분봉·KRX 부재 봉에서는 메뉴가 UN 으로 되돌린다(없는 시장은 못 지목).
    const [menuMarket, setMenuMarket] = usePanelUi<"un" | "krx">(panelId, "menuMarket", "un");

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)
    const { chartGroupsOf, pathLabel } = useGroups();
    // 두 날짜: 일봉=기준일(앵커, 2년), 분봉·큐레이션=검색날짜(기본=기준일, 일봉 봉 클릭이 드리프트). 고정 시 기준일 붙박이.
    const viewDate = pinMinute ? anchorDate : searchDate;
    // 이 차트(검색날짜)의 큐레이션 존재 요약 — "이 날 내가 뭘 남겼더라"를 헤더에서 답한다.
    // 재료는 작업셋과 같은 복제본 캐시(usePresence 포트) — 추가 페치 0.
    const presence = usePresenceOf(code, viewDate);
    const drifted = viewDate !== anchorDate;
    // 번들 읽기 포트(useChartBundle) — keepPreviousData 등 observer 규칙은 거기 한 곳. viewDate=anchor 면 같은 쿼리(RQ dedup).
    const dailyQ = useChartBundle(code, anchorDate);
    const minuteQ = useChartBundle(code, viewDate);
    const { dailyView, minuteView, dailyFrameKey, minuteFrameKey, pctBase } = useChartViews(dailyQ.data, minuteQ.data, mode, viewDate);

    // 차트 앵커 편집 — param 하나 = 훅 하나(chartAnchorHooks). 같은 쿼리 키라 왕복은 하나(RQ dedup).
    const lines = useBaselineLines(code, viewDate, dailyQ.data, minuteQ.data);
    const ignore = useIgnoreCandles(code, viewDate);

    // 자동 Point(격자 파생) — 정의(pointDef) 반영 즉석 파생. ◇ 마커가 품질 육안 검증 입구다(재현율 대신).
    // 고점 렌즈면 ◇ 라벨에 다리 고점(시그널 이후 첫 확정 고점)을 덧붙이고, 그 봉엔 호박색 세로선을 따로 긋는다.
    const autoView = useAutoPoints();
    const grids = usePointGrids();
    const lens = useWorkbench((s) => s.pointDef.lens);
    const { autoPoints, legHighTimes } = useMemo<{ autoPoints: AutoPointInput[]; legHighTimes: number[] }>(() => {
        const grid = lens === "high" ? grids.gridOf(code, viewDate) : undefined;
        const legTimes = new Set<number>();
        const list = autoPointsOfChart(autoView, code, viewDate).map((p) => {
            let label = `자동 ${p.kind === "breakout" ? "돌파" : "재돌파"} ${p.ordinal + 1}번째 · 레벨 ${p.levelPrice.toLocaleString()} · 대금 ${(Number(p.tv) / 1e8).toFixed(0)}억`;
            if (lens === "high") {
                const high = grid ? legHighOf(grid, p.min) : null;
                if (high === null) label += " · 고점 없음(꼬리)";
                else {
                    label += ` · 고점 ${minuteToHms(high.pivot.min).slice(0, 5)} (+${(((high.pivot.price - p.levelPrice) / p.levelPrice) * 100).toFixed(1)}%)`;
                    legTimes.add(kstToUnix(viewDate, minuteToHms(high.pivot.min)));
                }
            }
            return { time: kstToUnix(viewDate, minuteToHms(p.min)), label };
        });
        return { autoPoints: list, legHighTimes: [...legTimes] };
    }, [autoView, grids, lens, code, viewDate]);

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음. 검색날짜(viewDate) 기준.
    const markerTime = useMemo(() => (time && viewDate ? kstToUnix(viewDate, time) : null), [time, viewDate]);

    const dailyLines = lines.dLines;
    const minuteLines = lines.resolvedLines;

    // 상단 앵커 표식 — 승자 좌표는 **리졸버가 고른 것**을 그대로 물려받는다(칩이 재판정하면 하늘색 선과 갈린다).
    // ⚠ 번들 종목 게이트: 선은 ownBundle 이 막아 주지만 표식은 `timeToCoordinate(날짜)` 로 x 를 얻어
    // 전환 과도기(keepPreviousData 로 직전 종목 캔들이 남은 창)에 **옛 봉 위에 그대로 선다** — 같은 날짜가
    // 그쪽에도 있기 때문이다. 선이 쓰는 **그 술어**(ownBundle)로 막는다 — 판정이 두 벌이면 한쪽만 고쳐진다.
    const allMarks = useAnchorMarks(code, viewDate, lines.winnerKey);
    const dailyMarks = showAnchorMarks && ownBundle(dailyQ.data, code) ? allMarks.daily : undefined;
    const minuteMarks = showAnchorMarks && ownBundle(minuteQ.data, code) ? allMarks.minute : undefined;

    // ── 봉 우클릭 메뉴 — 선 긋기(시장×값)와 무시 캔들 토글이 한자리에. 선 근처 우클릭은 삭제 항목만.
    // 메뉴는 열린 차트(code·viewDate)의 것 — useDismiss 는 mousedown/Esc 만 들어, 메뉴를 둔 채 키보드로 종목·날짜를
    // 옮기면 옛 봉 날짜로 새 차트에 앵커를 쓰는 사고가 났다. 시선이 바뀌면 렌더에서 접는다(effect 경합 없음).
    const [rawMenu, setCandleMenu] = useState<{ chart: { code: string; date: string }; x: number; y: number; candle?: { date: string; time?: string }; nearLine?: RenderLine } | null>(null);
    const candleMenu = rawMenu && rawMenu.chart.code === code && rawMenu.chart.date === viewDate ? rawMenu : null;
    const openMenu = (at: { x: number; y: number }, rest: { candle?: { date: string; time?: string }; nearLine?: RenderLine }): void =>
        setCandleMenu({ chart: { code, date: viewDate }, ...at, ...rest });
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

    // 헤더 컨트롤 선언 — 공통 문구는 ChartPanelChrome 의 공장이 들고, 이 패널에만 있는 것(타점정보·
    // 지우기)만 여기서 만든다. 지우기는 할 게 없으면 사라지는 대신 흐려진다(자리 고정 규약).
    const controls = useMemo<ControlSpec[]>(() => [
        viewControl(view, setView),
        pinControl(pinMinute, () => setPinMinute((v) => !v)),
        scaleControl(lockScale, () => setLockScale((v) => !v)),
        {
            kind: "toggle", id: "pointInfo", name: "타점정보", activeColor: "var(--accent-primary)",
            help: "현재 타점(시간선)의 값 읽기", on: showPointInfo, set: () => setShowPointInfo((v) => !v),
        },
        amountMarkerControl(showMarkers, () => setShowMarkers((v) => !v)),
        searchLineControl(showLine, () => setShowLine((v) => !v)),
        guideControl(showGuide, () => setShowGuide((v) => !v)),
        anchorMarkControl(showAnchorMarks, () => setShowAnchorMarks((v) => !v)),
        {
            kind: "action", id: "clearLines", name: "선 지우기", group: "지우기",
            help: "가격선 전체 지우기", run: lines.clear, disabled: !lines.hasLines,
        },
        marketControl(mode, setMode),
    ], [view, setView, pinMinute, setPinMinute, lockScale, setLockScale, showPointInfo, setShowPointInfo,
        showMarkers, setShowMarkers, showLine, setShowLine, showGuide, setShowGuide,
        showAnchorMarks, setShowAnchorMarks,
        lines.clear, lines.hasLines, mode, setMode]);

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
                controls={controls}
                storageKey="wb.headerPins.chart.replay"
                badges={
                    <>
                        {/* 존재 배지(day 줄) — 이 날의 큐레이션 요약. 뒤에 이 날의 그룹 칩(그룹은 하루 층위 하나뿐). */}
                        <PresenceBadges presence={presence} />
                        <GroupChips groups={chartGroupsOf({ stockCode: code, date: viewDate })} pathOf={(id) => pathLabel(id, "(지워짐)")} style={{ maxWidth: 180, flexShrink: 1 }} />
                    </>
                }
            />

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && (dailyQ.isLoading || minuteQ.isLoading) && !dailyView && <Center text={`${code} 로딩중…`} />}
                {(dailyQ.isError || minuteQ.isError) && <Center text="오류 — 재시도 중…" />}
                {!!code && minuteView && dailyView && (
                    <ChartPanes
                        expanded={expanded}
                        viewDate={viewDate}
                        dailyTitle="봉 ctrl+클릭 / 더블클릭: 그 날짜로 검색 · 봉 우클릭: 메뉴(선 긋기·무시 캔들)"
                        minuteTitle="ctrl+클릭 / 더블클릭: 시각 이동 · ctrl+a/d: 타점 순회 · 봉 우클릭: 메뉴(선 긋기)"
                        daily={
                            dailyView.length > 0 ? (
                                <DailyChart
                                    points={dailyView}
                                    frameKey={dailyFrameKey}
                                    lines={dailyLines}
                                    zoom={chartZoom != null}
                                    zoomBars={cs.dailyZoomBars}
                                    zoomOutBars={cs.dailyZoomOutBars}
                                    onRightClick={(d, at) => openMenu(at, { candle: { date: d } })}
                                    onRemoveLine={(l) => lines.removeLineById(l.id)}
                                    onLineContext={(l, at) => openMenu(at, { nearLine: l })}
                                    onCandleClick={pinMinute ? undefined : (d) => setSearchDate(d === anchorDate ? null : d)}
                                    searchDate={showLine && drifted ? viewDate : undefined}
                                    pctBase={pctBase}
                                    showGuide={showGuide}
                                    ignoredDates={ignore.ignoredDates}
                                    anchorMarks={dailyMarks}
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
                                    autoPoints={autoPoints}
                                    legHighTimes={legHighTimes}
                                    showPointInfo={showPointInfo}
                                    zoom={chartZoom ? { bars: cs.minuteZoomBars, anchorTime: chartZoom.anchor } : null}
                                    lockTimeScale={lockScale}
                                    onMovePoint={(t) => setTime(t)}
                                    onRightClick={(a, at) => openMenu(at, { candle: { date: a.date, time: a.time } })}
                                    onRemoveLine={(l) => lines.removeLineById(l.id)}
                                    onLineContext={(l, at) => openMenu(at, { nearLine: l })}
                                    anchorMarks={minuteMarks}
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
