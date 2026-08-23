// 타점 정규화 — 여러 타점의 그 날 분봉(UN)을 **타점 시각 종가 = 0%** 로 접어 한 판에 겹친다.
// 원점 표식(▲)이 과거/미래를 가르므로 하루 전체를 그린다 — 타점 이후 눌림 깊이가 핵심 정보다.
//
// 시선 규칙(사용자 확정): 타점을 골랐으면(activePoint) 그 타점 하나, 하루만 골랐으면(time 없음)
// 그 차트의 **모든 타점**이 각각 선으로 오른다(색 구분). 타점 0개면 안 오른다.
// KRX/UN 토글은 **커서 읽기값의 기준가만** 바꾼다 — 그림은 언제나 UN·정규화 공간(사용자 확정).
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { chartQuery } from "../../api/queries.js";
import type { ChartBundle } from "../../api/chart.js";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { usePersistedState } from "../../store/persist.js";
import { useWorkbench } from "../../store/workbench.js";
import { useChartPoints } from "../../lib/useChartPoints.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { ACTIVE, seriesColor } from "../../styles/palette.js";
import { NormChart, type NormChartSeries } from "./NormChart.js";
import { minuteNorm, minutesOf, toBasePct, type NormMarket } from "./normModel.js";
import { parsePins, pinKey, PinChips, type NormPin } from "./normShared.js";

type Mode = "auto" | "candles" | "lines";
const AUTO_CANDLE_MAX = 3;

const parseMarket = (o: unknown): NormMarket | null => (o === "krx" || o === "un" ? o : null);
const parseMode = (o: unknown): Mode | null => (o === "auto" || o === "candles" || o === "lines" ? o : null);

const fmtPct = (p: number): string => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
const hm = (time: string): string => time.slice(0, 5);

export function PointNormPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const activePoint = useWorkbench((s) => s.activePoint);
    const { nameOf } = useStockNames();

    const [pins, setPins] = usePersistedState<NormPin[]>("wb.normPoint.pins", parsePins, []);
    const [baseMarket, setBaseMarket] = usePersistedState<NormMarket>("wb.normPoint.baseMarket", parseMarket, "un");
    const [mode, setMode] = usePersistedState<Mode>("wb.normPoint.mode", parseMode, "auto");
    const [fitTick, setFitTick] = useState(0);

    // 시선 — 타점이 골렸으면 그 하나, 아니면 focus 차트의 전 타점(복제본 셀렉터라 서버 왕복 없음).
    const chartPoints = useChartPoints(focusCode, focusDate);
    const gazePoints = useMemo<NormPin[]>(() => {
        if (activePoint) return [{ code: activePoint.code, date: activePoint.date, time: activePoint.time }];
        if (!focusCode || !focusDate) return [];
        return chartPoints.map((p) => ({ code: p.stockCode, date: p.date, time: p.time }));
    }, [activePoint, focusCode, focusDate, chartPoints]);
    const gazeKeys = useMemo(() => new Set(gazePoints.map(pinKey)), [gazePoints]);

    // 항목 = 고정 + (고정에 없는) 시선. 같은 차트의 타점 여럿이 번들 하나를 공유한다 — 요청은 차트 단위.
    const items = useMemo<NormPin[]>(() => {
        const seen = new Set(pins.map(pinKey));
        return [...pins, ...gazePoints.filter((p) => !seen.has(pinKey(p)))];
    }, [pins, gazePoints]);
    const charts = useMemo(() => {
        const seen = new Map<string, { code: string; date: string }>();
        for (const it of items) seen.set(`${it.code}|${it.date}`, { code: it.code, date: it.date });
        return [...seen.values()];
    }, [items]);

    const bundles = useQueries({
        queries: charts.map((c) => chartQuery(c.code, c.date)),
        combine: (results) => {
            const m = new Map<string, ChartBundle>();
            results.forEach((r, i) => { if (r.data) m.set(`${charts[i].code}|${charts[i].date}`, r.data as ChartBundle); });
            return m;
        },
    });

    const labelOf = useMemo(
        () => (p: NormPin): string => `${nameOf(p.code) ?? p.code} ${p.date.slice(5)} ${p.time ? hm(p.time) : ""}`.trim(),
        [nameOf],
    );

    type Subject = { origin: number; bundle: ChartBundle };
    const { series, missing, loading, subject } = useMemo(() => {
        const out: NormChartSeries[] = [];
        let missing = 0;
        let loading = 0;
        /** 커서 기준가 변환의 주인 — 시선 첫 항목(정규화 성공한 것).
         *  콜백 안 대입이라 TS 흐름분석이 못 넓힌다 — 반환에서 명시 캐스트. */
        let subject: Subject | null = null;
        items.forEach((it, i) => {
            if (it.time === undefined) return; // 방어 — 이 패널의 항목은 언제나 타점
            const bundle = bundles.get(`${it.code}|${it.date}`);
            if (!bundle) { loading += 1; return; }
            const norm = minuteNorm(bundle, it.time);
            if (!norm) { missing += 1; return; }
            const key = pinKey(it);
            const isGaze = gazeKeys.has(key);
            if (isGaze && subject === null) subject = { origin: norm.origin, bundle };
            out.push({
                key,
                label: labelOf(it),
                color: isGaze ? ACTIVE : seriesColor(i),
                emphasized: isGaze,
                bars: norm.bars,
                markerT: minutesOf(it.time),
            });
        });
        return { series: out, missing, loading, subject: subject as Subject | null };
    }, [items, bundles, gazeKeys, labelOf]);

    const effMode: "candles" | "lines" = mode === "auto" ? (series.length <= AUTO_CANDLE_MAX ? "candles" : "lines") : mode;

    const colorOfPin = (p: NormPin): string => {
        const k = pinKey(p);
        if (gazeKeys.has(k)) return ACTIVE;
        const i = pins.findIndex((x) => pinKey(x) === k);
        return seriesColor(i);
    };

    const gazeAllPinned = gazePoints.length > 0 && gazePoints.every((p) => pins.some((x) => pinKey(x) === pinKey(p)));

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "baseMarket", name: "커서 기준가", help: "커서 읽기값의 전일 종가 기준(그림은 언제나 UN·정규화)",
            values: [{ v: "un", label: "UN" }, { v: "krx", label: "KRX" }],
            value: baseMarket, set: (v) => setBaseMarket(v === "krx" ? "krx" : "un"),
        },
        {
            kind: "choice", id: "mode", name: "그리기", help: `자동 = ${AUTO_CANDLE_MAX}개 이하 캔들, 넘으면 종가선`,
            values: [{ v: "auto", label: "자동" }, { v: "candles", label: "캔들" }, { v: "lines", label: "선" }],
            value: mode, set: (v) => setMode(v === "candles" ? "candles" : v === "lines" ? "lines" : "auto"),
        },
        {
            kind: "action", id: "pinGaze", name: "시선 고정", help: "지금 시선의 타점들을 고정 슬롯에 담는다(시선이 바뀌어도 남는다)",
            label: "고정",
            disabled: gazePoints.length === 0 || gazeAllPinned,
            run: () => setPins((prev) => {
                const seen = new Set(prev.map(pinKey));
                return [...prev, ...gazePoints.filter((p) => !seen.has(pinKey(p)))];
            }),
        },
        {
            kind: "action", id: "clearPins", name: "고정 비우기", label: "비우기",
            disabled: pins.length === 0,
            run: () => setPins([]),
        },
        {
            kind: "action", id: "fit", name: "척도 맞춤", help: "지금 데이터에 한 번 맞추고 다시 잠근다",
            label: "맞춤",
            run: () => setFitTick((t) => t + 1),
        },
    ], [baseMarket, setBaseMarket, mode, setMode, gazePoints, gazeAllPinned, pins.length, setPins]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>
            <PanelHeader chrome={false} padding="5px 10px" style={{ borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}
                    title="시선 = 고른 타점(없으면 focus 차트의 전 타점) + 고정 N. 결손 = 타점 시각 분봉 미수집">
                    {series.length}개{loading > 0 ? ` · 로딩 ${loading}` : ""}{missing > 0 ? ` · 결손 ${missing}` : ""}
                    {gazePoints.length === 0 ? " · 시선 타점 없음" : ""}
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.normPoint" />
            </PanelHeader>
            <PinChips pins={pins} labelOf={labelOf} colorOf={colorOfPin}
                onRemove={(k) => setPins((prev) => prev.filter((p) => pinKey(p) !== k))} />
            <div style={{ flex: 1, minHeight: 0 }}>
                {series.length === 0
                    ? <div style={{ padding: 14, fontSize: 12, color: "var(--text-tertiary)" }}>겹칠 타점이 없습니다 — 타점을 고르거나 고정을 담으세요.</div>
                    : (
                        <NormChart series={series} mode={effMode} xKind="min" fitTick={fitTick}
                            renderExtra={(_t, _rows, cursorPct) => {
                                if (cursorPct === null || subject === null) return null;
                                const base = subject.bundle.basePrice?.[baseMarket] ?? null;
                                const basePct = toBasePct(cursorPct, subject.origin, base);
                                return (
                                    <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-tertiary)" }}>
                                        커서 {fmtPct(cursorPct)}{basePct !== null ? ` · 전일 ${baseMarket.toUpperCase()}종가比 ${fmtPct(basePct)}` : ""}
                                    </div>
                                );
                            }}
                        />
                    )}
            </div>
        </div>
    );
}
