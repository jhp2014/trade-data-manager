// 차트 패널 — 경로의 (종목, 날짜) 일봉·분봉, 경로의 시각에 분봉 세로선.
// 일봉 봉 선택 = 경로의 날짜를 바꾼다 · 분봉 봉 선택 = 경로의 시각을 바꾼다(둘 다 ctrl+클릭 또는 더블클릭 — 가격 축에서
// 다른 날 봉을 고르면 날짜도). 일봉 shift+클릭 = 경로의 일봉 선(최대 2개) · 「토큰 복사」 = 구간을 골라 상태 토큰을
// 클립보드로(DESIGN 9절 「일봉 선」). 일봉은 왼쪽으로 끌면 과거를 더, 분봉은 「가격」 축에서 끌면 앞 거래일을 이어 받는다 —
// 끌어서 다른 날을 보는 것은 경로를 바꾸지 않는다(일봉은 늘 경로 날짜에서 끝난다).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CLOSE_TIME, usePanelPath } from "../store/paths.js";
import { useChartSettings } from "../store/chartSettings.js";
import { usePanelUi } from "../store/panelUi.js";
import { dailyRowsOf, useDailyCandles, useMinuteDay, useMinuteDays, useStockName, useTradingDays } from "../market/queries.js";
import { kstToUnix, type DailyMode } from "../market/domain.js";
import type { LabMinuteDay, PriceMode } from "../market/types.js";
import { deriveDailyView, deriveMinutePriceView, deriveMinuteView } from "../chart/derive.js";
import { DailyChart } from "../chart/DailyChart.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import type { MinuteAxis } from "../chart/minuteSeries.js";
import { Center } from "../ui/chrome.js";
import { lineRef, nearestField, toggleLine } from "../lib/stateToken.js";
import { priceLines, StateCopyMenu, zonesOf, type Zone } from "../chart/stateCopy.js";
import { usePanelHeader } from "../header/registry.js";

type ChartView = "both" | "daily" | "minute";
const VIEW_VALUES: readonly { v: ChartView; label: string }[] = [
    { v: "both", label: "둘 다" },
    { v: "daily", label: "일봉" },
    { v: "minute", label: "분봉" },
];
const VIEWS = VIEW_VALUES.map((o) => o.v);
const DAILY_MODE_VALUES: readonly { v: DailyMode; label: string }[] = [
    { v: "unfix", label: "UN*" },
    { v: "un", label: "UN" },
    { v: "krx", label: "KRX" },
];
const DAILY_MODES = DAILY_MODE_VALUES.map((o) => o.v);
const AXIS_VALUES: readonly { v: MinuteAxis; label: string }[] = [
    { v: "pct", label: "당일 %" },
    { v: "price", label: "가격" },
];
const AXES = AXIS_VALUES.map((o) => o.v);
/** 「가격」 축에서 왼쪽 끝에 닿을 때마다 더 받는 앞 거래일 수 · 이어 볼 수 있는 앞 거래일 상한(봉이 수만 개 쌓이지 않게). */
const OLDER_DAYS_STEP = 2;
const OLDER_DAYS_MAX = 30;

/** 일봉 시장 → 선·분봉 % 기준의 시장(UN* 도 통합). */
const venueOf = (m: DailyMode): PriceMode => (m === "krx" ? "krx" : "un");

export function ChartPanel({ panelId }: { panelId: string }): JSX.Element {
    const { path, write } = usePanelPath(panelId);
    const { code, date, time, lines, zone } = path.s;
    const [view, setView] = usePanelUi(panelId, "view", VIEWS, "both");
    const [mode, setMode] = usePanelUi(panelId, "dailyMode", DAILY_MODES, "unfix");
    const [axis, setAxis] = usePanelUi(panelId, "minuteAxis", AXES, "pct");
    const venue = venueOf(mode);
    const name = useStockName(code);

    // 경로가 바뀌면 새 데이터가 올 때까지 직전 데이터를 그대로 그린다(차트를 언마운트하지 않아 줌이 안 깨진다).
    // 그래서 "이 데이터가 지금 경로의 것인가"를 가려야 한다 — 표시범위 기준(frameKey)은 도착한 데이터에서 만들고,
    // 선·시각선은 지금 경로의 데이터일 때만 긋는다.
    const dq = useDailyCandles(code, date);
    const rows = useMemo(() => dailyRowsOf(dq.data), [dq.data]);
    const dailyCurrent = dq.data !== undefined && !dq.isPlaceholderData;
    const daily = useMemo(() => deriveDailyView(rows, mode), [rows, mode]);
    const dailyFrameKey = rows.length ? `${rows[0].stockCode}:${rows.at(-1)!.date}` : "";
    const needOlderDaily = (): void => {
        if (dailyCurrent && dq.hasNextPage && !dq.isFetchingNextPage) void dq.fetchNextPage();
    };

    const mq = useMinuteDay(code, date);
    const minuteCurrent = mq.data !== undefined && !mq.isPlaceholderData;
    // 「가격」 축의 앞 거래일 — 경로(종목·날짜)나 축이 바뀌면 0 에서 다시. 경로 날짜를 넘지 않는다.
    const [older, setOlder] = useState({ key: "", n: 0 });
    useEffect(() => setOlder({ key: "", n: 0 }), [axis]);
    const olderN = older.key === `${code}@${date}` && axis === "price" ? older.n : 0;
    const tradingDays = useTradingDays().data;
    const olderDates = useMemo(() => {
        if (olderN === 0 || !tradingDays) return [];
        const before = tradingDays.filter((d) => d < date);
        return before.slice(Math.max(0, before.length - olderN));
    }, [olderN, tradingDays, date]);
    const olderDays = useMinuteDays(code, olderDates);
    const minute = useMemo(() => {
        const day = mq.data;
        if (!day) return null;
        if (axis === "pct") return deriveMinuteView(day, venue);
        // 앞 날은 경로 날짜 쪽부터 끊김 없이 받은 데까지만 붙인다(중간이 아직이면 거기서 멈춘다 — 앞에만 붙여야 화면이 제자리).
        const got: LabMinuteDay[] = [];
        for (let i = olderDays.length - 1; i >= 0; i--) {
            const d = olderDays[i].data;
            if (!d) break;
            got.unshift(d);
        }
        return { points: deriveMinutePriceView(minuteCurrent ? [...got, day] : [day]), baseFallback: false };
    }, [mq.data, axis, venue, olderDays, minuteCurrent]);
    const minuteFrameKey = mq.data ? `${mq.data.stockCode}:${mq.data.date}:${axis}` : "";
    // 더 받기를 멈추는 때 — 가장 앞 날이 실패했거나 분봉이 없다(수집 전·상장 전·거래정지 — 그 앞도 대개 없다), 또는 상한.
    const olderFailed = olderDays.some((d) => d.failed);
    const oldestEmpty = olderDays.length > 0 && olderDays[0].data?.minutes.length === 0;
    const needOlderMinutes = (): void => {
        if (axis !== "price" || !minuteCurrent || olderFailed || oldestEmpty) return;
        if (olderDays.some((d) => d.data === undefined)) return; // 받는 중이면 기다린다
        const before = Math.min(OLDER_DAYS_MAX, tradingDays?.filter((d) => d < date).length ?? 0);
        if (olderN < before) setOlder({ key: `${code}@${date}`, n: Math.min(before, olderN + OLDER_DAYS_STEP) });
    };
    // 시각선은 경로 날짜의 봉에만 — 시각이 그 날 첫 봉보다 이르면(KRX 전용 종목의 08:30 등) 앞 날 마지막 봉에 긋지 않는다.
    const dayFirstTime = minute?.points.find((p) => p.date === date)?.time;
    const pathTime = minuteCurrent && time ? kstToUnix(date, `${time}:00`) : null;
    const markerTime = pathTime !== null && dayFirstTime !== undefined && pathTime >= dayFirstTime ? pathTime : null;

    // 일봉 선 — 가격은 지금 경로의 일봉에서만 읽는다(직전 종목 봉으로 긋지 않게). 통합 선은 늘 UN* 값이다.
    const priced = useMemo(() => (dailyCurrent ? priceLines(rows, lines) : []), [dailyCurrent, rows, lines]);
    const chartLines = useMemo(() => priced.flatMap((l) => (l.price == null ? [] : [{ ref: l.ref, price: l.price }])), [priced]);
    // 선이 있는데 일봉이 지금 경로의 것이 아니면(불러오는 중·오류) 구간을 못 만든다 — 열린 판이 「선 없음」으로 바뀌어 선을 뺀 토큰이 복사되지 않게 비운다
    const zones = useMemo(() => (code && date && (dailyCurrent || lines.length === 0) ? zonesOf(code, date, priced) : []), [code, date, dailyCurrent, lines.length, priced]);
    const missingLines = priced.filter((l) => l.price == null).map((l) => l.ref);
    const pickLine = (d: string, price: number): void => {
        if (!dailyCurrent || d >= date) return; // 선 봉은 경로 날짜보다 앞선 날만
        const c = rows.find((x) => x.date === d);
        if (!c) return;
        write({ lines: toggleLine(lines, { date: d, field: nearestField(c, venue, price), venue }) });
    };
    const [copied, setCopied] = useState<string | null>(null);
    useEffect(() => {
        if (copied === null) return;
        const t = setTimeout(() => setCopied(null), 2500);
        return () => clearTimeout(t);
    }, [copied]);
    const copyZone = (z: Zone): void => {
        navigator.clipboard.writeText(z.token).then(
            () => setCopied(`복사됨 ${z.token}`),
            () => setCopied("복사 실패 — 클립보드 권한"),
        );
        if (lines.length > 0) write({ lines, zone: z.k }); // 고른 구간을 기억 — 다음에 판을 열면 미리 골라 둔다
    };
    // f 줌 — 모든 차트 패널이 같이. 분봉은 켜는 순간의 경로 시각(미정 = 장 마감)을 가운데로.
    const zoomOn = useChartSettings((st) => st.zoom);
    const zs = useChartSettings((st) => st.settings);
    const zoomAnchor = minuteCurrent && date ? kstToUnix(date, `${time || CLOSE_TIME}:00`) : null;
    const minuteZoom = zoomOn ? { bars: zs.minuteZoomBars, anchorTime: zoomAnchor !== null && dayFirstTime !== undefined ? Math.max(zoomAnchor, dayFirstTime) : zoomAnchor } : null;
    const loading = (dq.isPlaceholderData && dq.isFetching) || (mq.isPlaceholderData && mq.isFetching);

    usePanelHeader(panelId, {
        info: [
            { id: "stock", name: "종목", text: () => (name ? `${name} ${code}` : code || null) },
            { id: "when", name: "날짜·시각", tabular: true, text: () => (date ? `${date}${time ? ` ${time}` : ""}` : null) },
            {
                id: "baseFallback", name: "분봉 % 기준", tone: "warn", help: "전일 종가가 없어 분봉 % 를 그 날 첫 시가 기준으로 그렸다",
                text: () => (minute?.baseFallback && view !== "daily" ? "분봉 % = 첫 시가 기준(전일 종가 없음)" : null),
            },
            // 경로가 바뀌어 새 데이터를 기다리는 동안 — 차트는 직전 것을 그대로 두므로 알림만.
            { id: "loading", name: "불러오는 중", transient: true, tone: "accent", text: () => (loading ? "불러오는 중…" : null) },
            { id: "lines", name: "일봉 선", help: "shift+클릭으로 그은 선(토큰 표기) — 위/아래는 복사할 때 고른다", tabular: true, text: () => (lines.length ? `선 ${lines.map(lineRef).join(" · ")}` : null) },
            { id: "linesMissing", name: "선 봉 없음", tone: "warn", help: "선 봉이 받은 일봉에 없어 긋지 못했다 — 일봉을 왼쪽으로 끌어 더 받으면 그어진다", text: () => (missingLines.length ? `선 봉 없음 ${missingLines.join(" · ")}` : null) },
            { id: "copied", name: "복사", transient: true, tone: "accent", text: () => copied },
            { id: "olderFailed", name: "앞 데이터 받기 실패", tone: "warn", help: "왼쪽으로 끌어 더 받던 앞 일봉·분봉 요청이 실패했다 — 경로를 다시 열면 다시 받는다", text: () => (dq.isFetchNextPageError ? "앞 일봉 받기 실패" : olderFailed && axis === "price" ? "앞 분봉 받기 실패" : null) },
        ],
        controls: [
            { kind: "choice", id: "view", name: "보기", values: VIEW_VALUES, value: view, set: (v) => setView(v as ChartView) },
            {
                kind: "choice", id: "dailyMode", name: "일봉 시장", help: "UN* = 통합에서 NXT 유령 체결을 걷은 값(표식 = 보정된 봉) · UN = 통합 원본 · KRX. 새로 긋는 선의 시장·분봉 % 기준도",
                values: DAILY_MODE_VALUES, value: mode, set: (v) => setMode(v as DailyMode),
            },
            { kind: "choice", id: "minuteAxis", name: "분봉 축", help: "당일 % = 그 날 하루 · 가격 = 수정주가 원화, 왼쪽으로 끌면 앞 거래일을 이어 본다", values: AXIS_VALUES, value: axis, set: (v) => setAxis(v as MinuteAxis) },
            lines.length === 0
                ? { kind: "action", id: "copyState", name: "토큰 복사", help: "종목@날짜(선이 없는 상태)를 클립보드로", defaultPlace: "line", disabled: !code || !date, run: () => zones[0] && copyZone(zones[0]) }
                : {
                      kind: "popover", id: "copyState", name: "토큰 복사", help: "선이 나눈 구간을 골라 상태 토큰을 클립보드로", defaultPlace: "line",
                      disabled: !dailyCurrent, // 선 가격은 지금 경로의 일봉에서만 — 불러오는 중·오류엔 구간을 못 만든다
                      renderPopover: (close) => <StateCopyMenu zones={zones} selected={zone} onPick={(z) => { copyZone(z); close(); }} />,
                  },
            { kind: "action", id: "clearLines", name: "선 지우기", disabled: lines.length === 0, run: () => write({ lines: [] }) },
        ],
    });

    let body: ReactNode;
    if (!code || !date) body = <Center>경로 {path.id} 에 종목과 날짜를 넣으세요.</Center>;
    // 앞 덩이(더 받기)만 실패했으면 차트는 그대로 둔다 — 알림만(olderFailed)
    else if (dq.isError && !dq.data) body = <Center>차트 오류: {dq.error.message}</Center>;
    else if (!dq.data) body = <Center>불러오는 중…</Center>;
    else {
        const showDaily = view !== "minute";
        const showMinute = view !== "daily";
        body = (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {showDaily && (
                    <Pane label="일봉">
                        {daily.length > 0 ? (
                            <DailyChart
                                points={daily}
                                frameKey={dailyFrameKey}
                                visibleBars={zoomOn ? zs.dailyZoomBars : zs.dailyZoomOutBars}
                                onPickDate={(d) => write({ date: d })}
                                lines={chartLines}
                                onShiftPick={pickLine}
                                onNeedOlder={needOlderDaily}
                            />
                        ) : (
                            <Center>일봉 없음</Center>
                        )}
                    </Pane>
                )}
                {showMinute && (
                    <Pane label="분봉" divider={showDaily}>
                        {mq.isError ? (
                            <Center>분봉 오류: {mq.error.message}</Center>
                        ) : minute && minute.points.length > 0 ? (
                            <MinuteChart
                                points={minute.points}
                                frameKey={minuteFrameKey}
                                markerTime={markerTime}
                                zoom={minuteZoom}
                                axis={axis}
                                onPickTime={(d, t) => write(d === date ? { time: t.slice(0, 5) } : { date: d, time: t.slice(0, 5) })}
                                onNeedOlder={needOlderMinutes}
                            />
                        ) : (
                            <Center>{minuteCurrent ? `${date} 분봉 없음` : "불러오는 중…"}</Center>
                        )}
                    </Pane>
                )}
            </div>
        );
    }

    return <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)" }}>{body}</div>;
}

function Pane({ label, divider = false, children }: { label: string; divider?: boolean; children: ReactNode }): JSX.Element {
    return (
        <div style={{ flex: 1, minHeight: 0, position: "relative", borderTop: divider ? "1px solid var(--border)" : undefined }}>
            <span style={{ position: "absolute", left: 8, top: 4, zIndex: 5, fontSize: 11, color: "var(--text-3)", pointerEvents: "none" }}>{label}</span>
            {children}
        </div>
    );
}
