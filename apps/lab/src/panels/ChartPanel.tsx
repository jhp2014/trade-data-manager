// 차트 패널 — 경로의 (종목, 날짜) 일봉·분봉, 경로의 시각에 분봉 세로선.
// 일봉 봉 선택 = 경로의 날짜를 바꾼다 · 분봉 봉 선택 = 경로의 시각을 바꾼다(둘 다 ctrl+클릭 또는 더블클릭 — 가격 축에서
// 다른 날 봉을 고르면 날짜도). 우클릭 = 그 봉에 임시 선(값은 「우클릭 선」 설정 — 일봉은 경로의 선 최대 3개, 분봉은 이 패널의 잠깐 선).
// 선 칩: 임시만 클릭 = 저장 · 저장만 클릭 = 임시로 가져옴 · 우클릭 = 한 겹 걷기(DESIGN 9절 「선 — 임시 선과 저장 선」). 「토큰 복사」 = 구간을 골라 상태 토큰을
// 클립보드로(DESIGN 9절 「일봉 선」). 일봉은 왼쪽으로 끌면 과거를 더, 분봉은 「가격」 축에서 끌면 앞 거래일을 이어 받는다 —
// 끌어서 다른 날을 보는 것은 경로를 바꾸지 않는다(일봉은 늘 경로 날짜에서 끝난다).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CLOSE_TIME, usePanelPath } from "../store/paths.js";
import { useChartSettings } from "../store/chartSettings.js";
import { usePanelUi } from "../store/panelUi.js";
import { dailyRowsOf, useChartLines, useDailyCandles, useMinuteDay, useMinuteDays, useStockName, useTradingDays } from "../market/queries.js";
import { kstToUnix, type DailyMode } from "../market/domain.js";
import type { LabMinuteDay, PriceMode } from "../market/types.js";
import { deriveDailyView, deriveMinutePriceView, deriveMinuteView } from "../chart/derive.js";
import { lineColorOf, lineLevelPct, type LineKind, type PriceLevel } from "../chart/priceLevels.js";
import { chipAction, mergeDaily, mergeMinute, minuteRef, toLabDaily, toLabMinute, type MinuteLineCoord } from "../chart/lineSets.js";
import type { LineMark } from "../chart/lineMarks.js";
import { DailyChart } from "../chart/DailyChart.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import type { MinuteAxis } from "../chart/minuteSeries.js";
import { Center } from "../ui/chrome.js";
import { FIELD_LABEL, linePrice, lineRef, toggleLine, type LineField } from "../lib/stateToken.js";
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
const LINE_FIELDS: readonly LineField[] = ["O", "H", "L", "C"];
const LINE_FIELD_VALUES = LINE_FIELDS.map((v) => ({ v, label: FIELD_LABEL[v] }));
const BAR_KEY = { O: "open", H: "high", L: "low", C: "close" } as const;
const KIND_TIP: Record<LineKind, string> = {
    temp: "임시 선 · 클릭 = 저장 · 우클릭 = 지우기",
    both: "저장됨(임시에도 있음) · 우클릭 = 저장에서 지우기",
    saved: "저장된 선 · 클릭 = 임시로 가져오기(토큰) · 우클릭 = 저장에서 지우기",
};
const NO_MINUTE_LINES: MinuteLineCoord[] = [];
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
    const [lineField, setLineField] = usePanelUi(panelId, "lineField", LINE_FIELDS, "H");
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

    // 일봉 선 = 임시(경로의 선 — 토큰의 손잡이) ∪ 저장(lab 저장소 — 이 차트의 것). 같은 선은 칩 하나(종류로 가른다).
    // 가격은 지금 경로의 일봉에서만 읽는다(직전 종목 봉으로 긋지 않게). 통합 선은 늘 UN* 값이다.
    const saved = useChartLines(code, date);
    const linesReady = dailyCurrent && saved.current;
    const priced = useMemo(() => (dailyCurrent ? priceLines(rows, lines) : []), [dailyCurrent, rows, lines]); // 임시만 — 토큰 구간
    const dailyMerged = useMemo(() => mergeDaily(lines, saved.lines), [lines, saved.lines]);
    const dailyPriced = useMemo(
        () => (dailyCurrent ? dailyMerged.map(({ item, kind }) => ({ item, kind, ref: lineRef(item), price: linePrice(rows, item) })) : []),
        [dailyCurrent, dailyMerged, rows],
    );
    const chartLines = useMemo(
        (): LineMark[] =>
            dailyPriced.flatMap((l) =>
                l.price == null
                    ? []
                    : [{
                          key: l.ref, time: l.item.date, price: l.price, kind: l.kind,
                          short: `${l.item.field}${l.item.venue === "krx" ? "·K" : ""}`,
                          tip: `${l.ref} — ${l.item.date} ${FIELD_LABEL[l.item.field]}${l.item.venue === "krx" ? "(KRX)" : ""} ${l.price.toLocaleString()}\n${KIND_TIP[l.kind]}${l.kind === "saved" && l.item.date >= date ? "\n(같은 날 봉 — 토큰에 못 넣어 가져오기 안 됨)" : ""}`,
                      }],
            ),
        [dailyPriced],
    );
    // 선이 있는데 일봉이 지금 경로의 것이 아니면(불러오는 중·오류) 구간을 못 만든다 — 열린 판이 「선 없음」으로 바뀌어 선을 뺀 토큰이 복사되지 않게 비운다
    const zones = useMemo(() => (code && date && (dailyCurrent || lines.length === 0) ? zonesOf(code, date, priced) : []), [code, date, dailyCurrent, lines.length, priced]);
    const missingLines = dailyPriced.filter((l) => l.price == null).map((l) => l.ref);
    // 우클릭 = 그 봉의 「우클릭 선」 값(시가·고가·저가·종가 — 컨트롤 판 설정)에 임시 선. 같은 선을 다시 누르면 지운다.
    const pickLine = (d: string): void => {
        if (!dailyCurrent || d >= date) return; // 선 봉은 경로 날짜보다 앞선 날만
        write({ lines: toggleLine(lines, { date: d, field: lineField, venue }) });
    };
    // 칩 클릭 — 임시만 = 저장 · 저장만 = 임시로 가져옴(토큰에 넣을 때). 칩 우클릭 — 한 겹 걷기.
    const dailyOf = (key: string) => dailyMerged.find((x) => lineRef(x.item) === key);
    const onDailyChipAct = (m: LineMark, how: "click" | "context"): void => {
        const l = dailyOf(m.key);
        if (!linesReady || !l) return;
        const act = chipAction(l.kind, how);
        if (act === "save") saved.save(toLabDaily(l.item, date));
        // 임시 선은 경로 날짜보다 앞선 봉만(토큰 불변식) — 옮겨 온 workbench 당일 앵커는 가져오지 않는다
        else if (act === "import" && l.item.date < date) write({ lines: toggleLine(lines, l.item) });
        else if (act === "dropTemp") write({ lines: lines.filter((x) => lineRef(x) !== m.key) });
        else if (act === "dropSaved") saved.remove(toLabDaily(l.item, date));
    };

    // 분봉 선 = 잠깐 선(이 패널에서만 — 토큰에 없다, 경로가 바뀌면 사라진다) ∪ 저장 분봉 선. 값은 그 봉의 지금 축 단위.
    const chartKey = `${code}@${date}`;
    const [minuteTemp, setMinuteTemp] = useState<{ key: string; lines: MinuteLineCoord[] }>({ key: "", lines: [] });
    useEffect(() => setMinuteTemp({ key: chartKey, lines: [] }), [chartKey]); // 경로가 바뀌면 비운다(되돌아와도 살아나지 않게)
    const minuteTempLines = minuteTemp.key === chartKey ? minuteTemp.lines : NO_MINUTE_LINES;
    const minuteMerged = useMemo(() => mergeMinute(minuteTempLines, saved.lines), [minuteTempLines, saved.lines]);
    const minuteMarks = useMemo((): LineMark[] => {
        if (!minute || !minuteCurrent) return [];
        const byKey = new Map(minute.points.map((p) => [`${p.date} ${p.tradeTime}`, p]));
        return minuteMerged.flatMap(({ item, kind }) => {
            const p = byKey.get(`${item.date} ${item.time}`);
            if (!p) return []; // 그 날 분봉을 아직 안 받았다(가격 축의 앞 날) — 받으면 선다
            return [{ key: minuteRef(item), time: p.time, price: p[BAR_KEY[item.field]], kind, short: item.field, tip: `${item.date} ${item.time.slice(0, 5)} ${FIELD_LABEL[item.field]}\n${KIND_TIP[kind]}` }];
        });
    }, [minute, minuteCurrent, minuteMerged]);
    const pickMinuteLine = (d: string, t: string): void => {
        if (!minuteCurrent || d > date) return;
        const c: MinuteLineCoord = { date: d, time: t, field: lineField };
        const ref = minuteRef(c);
        setMinuteTemp({ key: chartKey, lines: minuteTempLines.some((x) => minuteRef(x) === ref) ? minuteTempLines.filter((x) => minuteRef(x) !== ref) : [...minuteTempLines, c] });
    };
    const minuteOf = (key: string) => minuteMerged.find((x) => minuteRef(x.item) === key);
    const onMinuteChipAct = (m: LineMark, how: "click" | "context"): void => {
        const l = minuteOf(m.key);
        if (!saved.current || !l) return;
        const act = chipAction(l.kind, how);
        if (act === "save") saved.save(toLabMinute(l.item, date));
        else if (act === "import") setMinuteTemp({ key: chartKey, lines: [...minuteTempLines, l.item] });
        else if (act === "dropTemp") setMinuteTemp({ key: chartKey, lines: minuteTempLines.filter((x) => minuteRef(x) !== m.key) });
        else if (act === "dropSaved") saved.remove(toLabMinute(l.item, date));
    };
    // 그 봉을 지금 분봉에서 못 찾은 분봉 선(당일 % 는 그 날 하루만 — 가격 축의 앞 날 선은 안 보인다)
    const minuteHidden = minuteCurrent ? minuteMerged.length - minuteMarks.length : 0;

    // 분봉 가로선 = 일봉 선(임시·저장) — 당일 % 면 그 날 원주가 스케일로 되돌려 % 기준가 대비(분봉과 같은 기준·같은 대체), 가격이면 수정주가 그대로 —
    // 와 분봉 선(값이 이미 축 단위).
    const minuteLevels = useMemo((): PriceLevel[] => {
        const day = mq.data;
        if (!minuteCurrent || !day) return [];
        const ok = dailyPriced.filter((l): l is typeof l & { price: number } => l.price != null);
        const own = minuteMarks.map((m) => ({ key: `m:${m.key}`, value: m.price, color: lineColorOf(m.kind) }));
        if (axis === "price") return [...ok.map((l) => ({ key: l.ref, value: l.price, color: lineColorOf(l.kind) })), ...own];
        const base = day.basePrice?.[venue] ?? (day.minutes[0] ? Number(day.minutes[0].un.open) : null);
        if (!base) return own;
        return [...ok.map((l) => ({ key: l.ref, value: lineLevelPct(l.price, day.rawScale, base), color: lineColorOf(l.kind) })), ...own];
    }, [mq.data, minuteCurrent, dailyPriced, minuteMarks, axis, venue]);
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
            { id: "lines", name: "일봉 선", help: "우클릭으로 그은 선(토큰 표기) — 위/아래는 복사할 때 고른다", tabular: true, text: () => (lines.length ? `선 ${lines.map(lineRef).join(" · ")}` : null) },
            { id: "linesMissing", name: "선 봉 없음", tone: "warn", help: "선 봉이 받은 일봉에 없어 긋지 못했다 — 일봉을 왼쪽으로 끌어 더 받으면 그어진다. 분봉 선은 그 날 분봉이 화면에 없으면(당일 % 는 그 날 하루만) 안 보인다", text: () => {
                const parts = [...(missingLines.length ? [`선 봉 없음 ${missingLines.join(" · ")}`] : []), ...(minuteHidden > 0 ? [`분봉 선 ${minuteHidden}개 안 보임`] : [])];
                return parts.length ? parts.join(" · ") : null;
            } },
            { id: "copied", name: "복사", transient: true, tone: "accent", text: () => copied },
            { id: "savedLines", name: "저장 선", help: "lab 저장소에 저장된 이 차트의 선(일봉·분봉) 수", tabular: true, text: () => (saved.lines.length ? `저장 ${saved.lines.length}` : null) },
            { id: "linesError", name: "저장 오류", tone: "warn", help: "lab 저장 선을 읽거나 쓰다 실패했다(lab-api 의 CHART_LINES_DIR 확인)", text: () => (saved.error ? `저장 선 오류: ${saved.error.message}` : null) },
            { id: "olderFailed", name: "앞 데이터 받기 실패", tone: "warn", help: "왼쪽으로 끌어 더 받던 앞 일봉·분봉 요청이 실패했다 — 경로를 다시 열면 다시 받는다", text: () => (dq.isFetchNextPageError ? "앞 일봉 받기 실패" : olderFailed && axis === "price" ? "앞 분봉 받기 실패" : null) },
        ],
        controls: [
            { kind: "choice", id: "view", name: "보기", values: VIEW_VALUES, value: view, set: (v) => setView(v as ChartView) },
            {
                kind: "choice", id: "dailyMode", name: "일봉 시장", help: "UN* = 통합에서 NXT 유령 체결을 걷은 값(표식 = 보정된 봉) · UN = 통합 원본 · KRX. 새로 긋는 선의 시장·분봉 % 기준도",
                values: DAILY_MODE_VALUES, value: mode, set: (v) => setMode(v as DailyMode),
            },
            {
                kind: "choice", id: "lineField", name: "우클릭 선", help: "봉을 우클릭하면 그 봉의 이 값에 임시 선을 긋는다(같은 선을 다시 우클릭하면 지운다). 일봉은 경로의 선(최대 3개, 시장은 「일봉 시장」), 분봉은 이 패널의 잠깐 선(통합). 칩을 누르면 저장",
                values: LINE_FIELD_VALUES, value: lineField, set: (v) => setLineField(v as LineField),
            },
            { kind: "choice", id: "minuteAxis", name: "분봉 축", help: "당일 % = 그 날 하루 · 가격 = 수정주가 원화, 왼쪽으로 끌면 앞 거래일을 이어 본다", values: AXIS_VALUES, value: axis, set: (v) => setAxis(v as MinuteAxis) },
            lines.length === 0
                ? { kind: "action", id: "copyState", name: "토큰 복사", button: "복사", help: "종목@날짜(선이 없는 상태)를 클립보드로", defaultPlace: "line", disabled: !code || !date, run: () => zones[0] && copyZone(zones[0]) }
                : {
                      kind: "popover", id: "copyState", name: "토큰 복사", button: "복사", help: "선이 나눈 구간을 골라 상태 토큰을 클립보드로", defaultPlace: "line",
                      disabled: !dailyCurrent, // 선 가격은 지금 경로의 일봉에서만 — 불러오는 중·오류엔 구간을 못 만든다
                      renderPopover: (close) => <StateCopyMenu zones={zones} selected={zone} onPick={(z) => { copyZone(z); close(); }} />,
                  },
            { kind: "action", id: "clearLines", name: "선 지우기", button: "지우기", disabled: lines.length === 0, run: () => write({ lines: [] }) },
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
                                onLinePick={pickLine}
                                onChipClick={(m) => onDailyChipAct(m, "click")}
                                onChipRemove={(m) => onDailyChipAct(m, "context")}
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
                                levels={minuteLevels}
                                marks={minuteMarks}
                                onLinePick={pickMinuteLine}
                                onChipClick={(m) => onMinuteChipAct(m, "click")}
                                onChipRemove={(m) => onMinuteChipAct(m, "context")}
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
