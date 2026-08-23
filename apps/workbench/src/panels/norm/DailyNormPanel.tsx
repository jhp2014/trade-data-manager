// 일봉 정규화 — 여러 (종목, 날짜)의 일봉을 **D−1 종가 = 0%** 로 접어 한 판에 겹친다.
// "각자 어떤 바닥에서 D 까지 왔는가"를 공통 척도에서 비교하는 자리 — 옛 골격 패널의 후신인데,
// 골격(손 피벗) 없이 실물(캔들/종가선)을 정규화만 해서 겹친다(골격의 실가치 = 정규화, 사용자 실측 결론).
//
// 재료는 차트 패널과 **같은 캐시 한 벌**(chartQuery 벌크) — 여기서 본 항목을 차트 패널로 열면 즉시다.
// KRX/UN 토글은 봉과 원점이 **함께** 갈린다(그리는 시장 = 원점의 시장). API 가 D 까지만 주므로 미래 절단은 공짜.
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { chartQuery } from "../../api/queries.js";
import type { ChartBundle } from "../../api/chart.js";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { usePersistedState } from "../../store/persist.js";
import { useWorkbench } from "../../store/workbench.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { ACTIVE, seriesColor } from "../../styles/palette.js";
import { NormChart, type NormChartSeries } from "./NormChart.js";
import { dailyNorm, type NormMarket } from "./normModel.js";
import { parsePins, pinKey, PinChips, type NormPin } from "./normShared.js";

type Mode = "auto" | "candles" | "lines";
/** 자동 모드의 캔들 상한 — 이 수를 넘으면 종가선(겹친 캔들은 서로를 가린다). */
const AUTO_CANDLE_MAX = 3;

const parseMarket = (o: unknown): NormMarket | null => (o === "krx" || o === "un" ? o : null);
const parseMode = (o: unknown): Mode | null => (o === "auto" || o === "candles" || o === "lines" ? o : null);

export function DailyNormPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const { nameOf } = useStockNames();

    const [pins, setPins] = usePersistedState<NormPin[]>("wb.normDaily.pins", parsePins, []);
    const [market, setMarket] = usePersistedState<NormMarket>("wb.normDaily.market", parseMarket, "un");
    const [mode, setMode] = usePersistedState<Mode>("wb.normDaily.mode", parseMode, "auto");
    // 맞춤 방아쇠 — 영속 아님(누를 때만 한 프레임 뜻이 있다).
    const [fitTick, setFitTick] = useState(0);

    // 시선 = focus 차트(자동 교체). 고정에 이미 있으면 중복으로 그리지 않고 그 고정을 시선색으로 세운다.
    const gaze = useMemo<NormPin | null>(
        () => (focusCode && focusDate ? { code: focusCode, date: focusDate } : null),
        [focusCode, focusDate],
    );
    const gazeKey = gaze ? pinKey(gaze) : null;
    const gazePinned = gazeKey !== null && pins.some((p) => pinKey(p) === gazeKey);
    const items = useMemo<NormPin[]>(
        () => (gaze && !gazePinned ? [...pins, gaze] : [...pins]),
        [pins, gaze, gazePinned],
    );

    // 재료 — 차트 패널과 같은 키 한 벌(chartQuery). 과거 날짜는 staleTime ∞ 라 한 번 받으면 세션 내내 공짜.
    const bundles = useQueries({
        queries: items.map((it) => chartQuery(it.code, it.date)),
        combine: (results) => results.map((r) => (r.data as ChartBundle | undefined) ?? null),
    });

    const labelOf = useMemo(
        () => (p: NormPin): string => `${nameOf(p.code) ?? p.code} ${p.date.slice(5)}`,
        [nameOf],
    );

    const { series, missing, loading } = useMemo(() => {
        const out: NormChartSeries[] = [];
        let missing = 0;
        let loading = 0;
        items.forEach((it, i) => {
            const bundle = bundles[i];
            if (!bundle) { loading += 1; return; }
            const norm = dailyNorm(bundle, market);
            if (!norm) { missing += 1; return; }
            const key = pinKey(it);
            const isGaze = key === gazeKey;
            out.push({
                key,
                label: labelOf(it),
                color: isGaze ? ACTIVE : seriesColor(i),
                emphasized: isGaze,
                bars: norm.bars,
            });
        });
        return { series: out, missing, loading };
    }, [items, bundles, market, gazeKey, labelOf]);

    const effMode: "candles" | "lines" = mode === "auto" ? (series.length <= AUTO_CANDLE_MAX ? "candles" : "lines") : mode;

    const colorOfPin = (p: NormPin): string => {
        const k = pinKey(p);
        if (k === gazeKey) return ACTIVE;
        const i = pins.findIndex((x) => pinKey(x) === k);
        return seriesColor(i);
    };

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "market", name: "시장", help: "봉과 원점(D−1 종가)이 함께 갈린다",
            values: [{ v: "un", label: "UN" }, { v: "krx", label: "KRX" }],
            value: market, set: (v) => setMarket(v === "krx" ? "krx" : "un"),
        },
        {
            kind: "choice", id: "mode", name: "그리기", help: `자동 = ${AUTO_CANDLE_MAX}개 이하 캔들, 넘으면 종가선`,
            values: [{ v: "auto", label: "자동" }, { v: "candles", label: "캔들" }, { v: "lines", label: "선" }],
            value: mode, set: (v) => setMode(v === "candles" ? "candles" : v === "lines" ? "lines" : "auto"),
        },
        {
            kind: "action", id: "pinGaze", name: "시선 고정", help: "지금 보는 차트를 고정 슬롯에 담는다(시선이 바뀌어도 남는다)",
            label: "고정",
            disabled: gaze === null || gazePinned,
            run: () => { if (gaze && !gazePinned) setPins((prev) => [...prev, gaze]); },
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
    ], [market, setMarket, mode, setMode, gaze, gazePinned, pins.length, setPins, setFitTick]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>
            <PanelHeader chrome={false} padding="5px 10px" style={{ borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}
                    title="시선 1(자동 교체) + 고정 N. 결손 = 재료 부족(봉 없음·원점 없음)">
                    {series.length}개{loading > 0 ? ` · 로딩 ${loading}` : ""}{missing > 0 ? ` · 결손 ${missing}` : ""}
                    {gaze === null ? " · 시선 없음" : ""}
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.normDaily" />
            </PanelHeader>
            <PinChips pins={pins} labelOf={labelOf} colorOf={colorOfPin}
                onRemove={(k) => setPins((prev) => prev.filter((p) => pinKey(p) !== k))} />
            <div style={{ flex: 1, minHeight: 0 }}>
                {series.length === 0
                    ? <div style={{ padding: 14, fontSize: 12, color: "var(--text-tertiary)" }}>겹칠 항목이 없습니다 — 종목을 선택하거나(시선) 고정을 담으세요.</div>
                    : <NormChart series={series} mode={effMode} xKind="day" fitTick={fitTick} />}
            </div>
        </div>
    );
}
