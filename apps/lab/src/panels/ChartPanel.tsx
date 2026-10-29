// 차트 패널 — 경로의 (종목, 날짜) 일봉·분봉, 경로의 시각에 분봉 세로선.
// 일봉 봉 선택 = 경로의 날짜를 바꾼다 · 분봉 봉 선택 = 경로의 시각을 바꾼다(둘 다 ctrl+클릭 또는 더블클릭).
// 일봉 shift+클릭 = 경로의 일봉 선(최대 2개) · 「토큰 복사」 = 구간을 골라 상태 토큰을 클립보드로(DESIGN 9절 「일봉 선」).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CLOSE_TIME, usePanelPath } from "../store/paths.js";
import { useChartSettings } from "../store/chartSettings.js";
import { usePanelUi } from "../store/panelUi.js";
import { useChartBundle, useStockName } from "../market/queries.js";
import { kstToUnix } from "../market/domain.js";
import type { PriceMode } from "../market/types.js";
import { deriveDailyView, deriveMinuteView } from "../chart/derive.js";
import { DailyChart } from "../chart/DailyChart.js";
import { MinuteChart } from "../chart/MinuteChart.js";
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
const MODE_VALUES: readonly { v: PriceMode; label: string }[] = [
    { v: "un", label: "통합" },
    { v: "krx", label: "KRX" },
];
const MODES = MODE_VALUES.map((o) => o.v);

export function ChartPanel({ panelId }: { panelId: string }): JSX.Element {
    const { path, write } = usePanelPath(panelId);
    const { code, date, time, lines, zone } = path.s;
    const [view, setView] = usePanelUi(panelId, "view", VIEWS, "both");
    const [mode, setMode] = usePanelUi(panelId, "priceMode", MODES, "un");
    const name = useStockName(code);
    const q = useChartBundle(code, date);

    // 경로가 바뀌면 새 번들이 올 때까지 직전 번들을 그대로 그린다(차트를 언마운트하지 않아 줌이 안 깨진다).
    // 그래서 "이 번들이 지금 경로의 것인가"를 가려야 한다 — 표시범위 기준(frameKey)은 도착한 데이터에서 만들고,
    // 시각선은 지금 경로의 번들일 때만 긋는다(직전 날짜 분봉 위에 새 시각을 긋지 않게).
    const bundle = q.data;
    const current = bundle !== undefined && !q.isPlaceholderData;
    const daily = useMemo(() => (bundle ? deriveDailyView(bundle, mode) : []), [bundle, mode]);
    const minute = useMemo(() => (bundle ? deriveMinuteView(bundle, mode) : null), [bundle, mode]);
    const dailyFrameKey = bundle ? `${bundle.stockCode}:${bundle.daily.at(-1)?.date ?? ""}` : "";
    const minuteFrameKey = bundle ? `${bundle.stockCode}:${bundle.minutes[0]?.date ?? ""}` : "";
    const markerTime = current && time ? kstToUnix(date, `${time}:00`) : null;

    // 일봉 선 — 가격은 지금 경로의 번들에서만 읽는다(직전 종목 봉으로 긋지 않게).
    const priced = useMemo(() => (current ? priceLines(bundle.daily, lines) : []), [current, bundle, lines]);
    const chartLines = useMemo(() => priced.flatMap((l) => (l.price == null ? [] : [{ ref: l.ref, price: l.price }])), [priced]);
    // 선이 있는데 번들이 지금 경로의 것이 아니면(불러오는 중·오류) 구간을 못 만든다 — 열린 판이 「선 없음」으로 바뀌어 선을 뺀 토큰이 복사되지 않게 비운다
    const zones = useMemo(() => (code && date && (current || lines.length === 0) ? zonesOf(code, date, priced) : []), [code, date, current, lines.length, priced]);
    const missingLines = priced.filter((l) => l.price == null).map((l) => l.ref);
    const pickLine = (d: string, price: number): void => {
        if (!bundle || !current || d >= date) return; // 선 봉은 경로 날짜보다 앞선 날만
        const c = bundle.daily.find((x) => x.date === d);
        if (!c) return;
        write({ lines: toggleLine(lines, { date: d, field: nearestField(c, mode, price), venue: mode }) });
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
    const minuteZoom = zoomOn ? { bars: zs.minuteZoomBars, anchorTime: current && date ? kstToUnix(date, `${time || CLOSE_TIME}:00`) : null } : null;

    usePanelHeader(panelId, {
        info: [
            { id: "stock", name: "종목", text: () => (name ? `${name} ${code}` : code || null) },
            { id: "when", name: "날짜·시각", tabular: true, text: () => (date ? `${date}${time ? ` ${time}` : ""}` : null) },
            {
                id: "baseFallback", name: "분봉 % 기준", tone: "warn", help: "전일 종가가 없어 분봉 % 를 그 날 첫 시가 기준으로 그렸다",
                text: () => (minute?.baseFallback && view !== "daily" ? "분봉 % = 첫 시가 기준(전일 종가 없음)" : null),
            },
            // 경로가 바뀌어 새 번들을 기다리는 동안 — 차트는 직전 것을 그대로 두므로 알림만.
            { id: "loading", name: "불러오는 중", transient: true, tone: "accent", text: () => (q.isPlaceholderData && q.isFetching ? "불러오는 중…" : null) },
            { id: "lines", name: "일봉 선", help: "shift+클릭으로 그은 선(토큰 표기) — 위/아래는 복사할 때 고른다", tabular: true, text: () => (lines.length ? `선 ${lines.map(lineRef).join(" · ")}` : null) },
            { id: "linesMissing", name: "선 봉 없음", tone: "warn", help: "선 봉이 이 차트의 일봉(2년)에 없어 긋지 못했다", text: () => (missingLines.length ? `선 봉 없음 ${missingLines.join(" · ")}` : null) },
            { id: "copied", name: "복사", transient: true, tone: "accent", text: () => copied },
        ],
        controls: [
            { kind: "choice", id: "view", name: "보기", values: VIEW_VALUES, value: view, set: (v) => setView(v as ChartView) },
            { kind: "choice", id: "mode", name: "기준", help: "분봉 % 기준가 · 일봉 시장(새로 긋는 선의 시장도)", values: MODE_VALUES, value: mode, set: (v) => setMode(v as PriceMode) },
            lines.length === 0
                ? { kind: "action", id: "copyState", name: "토큰 복사", help: "종목@날짜(선이 없는 상태)를 클립보드로", defaultPlace: "line", disabled: !code || !date, run: () => zones[0] && copyZone(zones[0]) }
                : {
                      kind: "popover", id: "copyState", name: "토큰 복사", help: "선이 나눈 구간을 골라 상태 토큰을 클립보드로", defaultPlace: "line",
                      disabled: !current, // 선 가격은 지금 경로의 번들에서만 — 불러오는 중·오류엔 구간을 못 만든다
                      renderPopover: (close) => <StateCopyMenu zones={zones} selected={zone} onPick={(z) => { copyZone(z); close(); }} />,
                  },
            { kind: "action", id: "clearLines", name: "선 지우기", disabled: lines.length === 0, run: () => write({ lines: [] }) },
        ],
    });

    let body: ReactNode;
    if (!code || !date) body = <Center>경로 {path.id} 에 종목과 날짜를 넣으세요.</Center>;
    else if (q.isError) body = <Center>차트 오류: {q.error.message}</Center>;
    else if (!bundle) body = <Center>불러오는 중…</Center>;
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
                            />
                        ) : (
                            <Center>일봉 없음</Center>
                        )}
                    </Pane>
                )}
                {showMinute && (
                    <Pane label="분봉" divider={showDaily}>
                        {minute && minute.points.length > 0 ? (
                            <MinuteChart points={minute.points} frameKey={minuteFrameKey} markerTime={markerTime} zoom={minuteZoom} onPickTime={(t) => write({ time: t.slice(0, 5) })} />
                        ) : (
                            <Center>{current ? `${date} 분봉 없음` : "불러오는 중…"}</Center>
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
