// 정규화 겹치기 차트 — lightweight-charts 위에 **여러 항목의 정규화 시계열**을 한 판에 얹는다.
// 차트 패널과 같은 골조(chartShell)를 쓴다 — 정규화 패널의 다른 점은 셋뿐이다:
//   · x 가 시간이 아니라 **정규화 좌표**(일봉=거래일 오프셋 / 분봉=벽시계 분) — 숫자를 Time 으로 부호화
//   · y 가 가격이 아니라 **원점 대비 %** — 항목마다 자기 원점으로 접힌 값이라 축이 공통 척도다
//   · 시리즈가 N 개(항목마다 하나) — 캔들/선을 항목 수가 고른다(패널이 정한 effective mode)
//
// ## 척도는 데이터에 자동 맞춤하지 않는다(사용자 확정)
// 첫 데이터에서 한 번 맞춘 뒤 **잠근다**(autoScale off). 항목을 넣고 빼도 척도가 안 흔들려야
// "누가 더 깊이 눌렸나"가 항목 구성과 무관하게 유지된다(공통 척도 원칙 승계). 다시 맞추기는 fitTick.
import { useEffect, useRef } from "react";
import {
    CandlestickSeries,
    CrosshairMode,
    LineSeries,
    LineStyle,
    createSeriesMarkers,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type SeriesMarker,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import type { ReactNode } from "react";
import { baseChartOptions, useChartShell, useCrosshairTooltip, useRafCursor } from "../../chart/chartShell.js";
import { FloatingTooltip } from "../../chart/tooltip.js";
import type { NormBar } from "./normModel.js";

export type NormXKind = "day" | "min";

export interface NormChartSeries {
    /** 항목 키(차트키/타점키) — 시리즈 재사용·툴팁 행 식별. */
    key: string;
    label: string;
    color: string;
    /** 시선 항목 — 굵게, 맨 위에 그린다. */
    emphasized?: boolean;
    bars: NormBar[];
    /** 타점 시각 표식(분봉 전용) — 이 t 의 봉 아래에 ▲. */
    markerT?: number;
}

/** 툴팁 한 행 — 크로스헤어 시점의 항목별 값(선=close%, 캔들=close%). */
export interface NormTooltipRow {
    key: string;
    label: string;
    color: string;
    value: number;
}

/** x 부호화 — 숫자 좌표를 UTCTimestamp 로 싣는다(일봉=일 단위 초, 분봉=분 단위 초). 라벨은 아래 포매터가 되돌린다. */
const encodeT = (t: number, xKind: NormXKind): UTCTimestamp => (xKind === "day" ? t * 86400 : t * 60) as UTCTimestamp;
const decodeT = (time: number, xKind: NormXKind): number => Math.round(xKind === "day" ? time / 86400 : time / 60);

export function fmtNormX(t: number, xKind: NormXKind): string {
    if (xKind === "day") return t === 0 ? "D" : `${t}`;
    const h = Math.floor(t / 60);
    return `${String(h).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const fmtPct = (p: number): string => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;

interface Created {
    api: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;
    meta: NormChartSeries;
    markers: ISeriesMarkersPluginApi<Time> | null;
}

export function NormChart({ series, mode, xKind, fitTick, renderExtra }: {
    series: readonly NormChartSeries[];
    mode: "candles" | "lines";
    xKind: NormXKind;
    /** 값이 바뀌면 표시범위를 데이터에 다시 맞춘다(맞춤 버튼) — 그 외엔 척도 잠금. */
    fitTick: number;
    /** 크로스헤어 툴팁 하단의 추가 행(패널이 기준가 변환 등을 붙인다). */
    renderExtra?: (t: number, rows: readonly NormTooltipRow[], cursorPct: number | null) => ReactNode;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const xKindRef = useRef(xKind);
    xKindRef.current = xKind;
    const chartRef = useChartShell(containerRef, () => ({
        ...baseChartOptions(),
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dotted, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dotted, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.06 } },
        leftPriceScale: { visible: false },
        timeScale: {
            borderVisible: false,
            // x 는 정규화 좌표 — 시간 규칙(월·일 눈금)을 끄고 숫자를 그대로 되돌려 적는다.
            tickMarkFormatter: (time: number) => fmtNormX(decodeT(time, xKindRef.current), xKindRef.current),
        },
        localization: {
            locale: "ko-KR",
            timeFormatter: (time: number) => fmtNormX(decodeT(time, xKindRef.current), xKindRef.current),
        },
    }));

    // 만든 시리즈 목록 — 툴팁이 (시리즈 → 항목) 역조회에 쓴다. 재구축 effect 만 쓴다.
    const createdRef = useRef<Created[]>([]);
    /** 척도 잠금 — 첫 데이터에서 한 번 맞춘 뒤 autoScale off. */
    const lockedRef = useRef(false);

    // ── 시리즈 재구축 — 항목·모드가 바뀌면 전부 지우고 다시 만든다. N 이 수십이라 재구축이 증분보다
    //    단순하고 충분히 싸다(같은 이유로 골격 패널도 표시목록을 매번 새로 만들었다).
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        for (const c of createdRef.current) {
            c.markers?.setMarkers([]);
            chart.removeSeries(c.api);
        }
        createdRef.current = [];
        if (series.length === 0) return;

        // 시선(emphasized)이 맨 위 — 나중에 add 된 시리즈가 위에 그려진다.
        const ordered = [...series].sort((a, b) => Number(a.emphasized === true) - Number(b.emphasized === true));
        for (const s of ordered) {
            let api: Created["api"];
            if (mode === "candles") {
                api = chart.addSeries(CandlestickSeries, {
                    upColor: s.color,
                    downColor: "rgba(255,255,255,0.15)",
                    borderVisible: true,
                    borderUpColor: s.color,
                    borderDownColor: s.color,
                    wickUpColor: s.color,
                    wickDownColor: s.color,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    priceFormat: { type: "custom", formatter: fmtPct, minMove: 0.01 },
                });
                api.setData(s.bars.map((b) => ({ time: encodeT(b.t, xKind), open: b.open, high: b.high, low: b.low, close: b.close })));
            } else {
                api = chart.addSeries(LineSeries, {
                    color: s.color,
                    lineWidth: s.emphasized ? 3 : 1,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                    priceFormat: { type: "custom", formatter: fmtPct, minMove: 0.01 },
                });
                api.setData(s.bars.map((b) => ({ time: encodeT(b.t, xKind), value: b.close })));
            }
            let markers: ISeriesMarkersPluginApi<Time> | null = null;
            if (s.markerT !== undefined) {
                markers = createSeriesMarkers(api);
                const m: SeriesMarker<Time> = {
                    time: encodeT(s.markerT, xKind),
                    position: "belowBar",
                    shape: "arrowUp",
                    color: s.color,
                    size: s.emphasized ? 2 : 1,
                };
                markers.setMarkers([m]);
            }
            createdRef.current.push({ api, meta: s, markers });
        }
        // 0% 기준선 — 원점의 자리. 재구축마다 첫 시리즈에 다시 붙인다(시리즈 없이는 선을 못 그린다).
        createdRef.current[0]?.api.createPriceLine({
            price: 0, color: "rgba(150,150,150,0.5)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "",
        });

        // 첫 데이터 = 한 번 맞추고 잠근다. 이후 재구축은 사용자의 척도를 건드리지 않는다.
        if (!lockedRef.current) {
            chart.timeScale().fitContent();
            requestAnimationFrame(() => {
                chartRef.current?.priceScale("right").applyOptions({ autoScale: false });
            });
            lockedRef.current = true;
        }
    }, [series, mode, xKind, chartRef]);

    // 맞춤 — 잠금을 한 프레임 풀어 현재 데이터에 맞추고 다시 잠근다.
    const fitSeen = useRef(fitTick);
    useEffect(() => {
        if (fitTick === fitSeen.current) return;
        fitSeen.current = fitTick;
        const chart = chartRef.current;
        if (!chart) return;
        chart.priceScale("right").applyOptions({ autoScale: true });
        chart.timeScale().fitContent();
        requestAnimationFrame(() => {
            chartRef.current?.priceScale("right").applyOptions({ autoScale: false });
        });
    }, [fitTick, chartRef]);

    const { cursor, onCursorMove } = useRafCursor();
    const { state: tip } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            if (param.time === undefined) return null;
            const t = decodeT(param.time as number, xKindRef.current);
            const rows: NormTooltipRow[] = [];
            for (const c of createdRef.current) {
                const d = param.seriesData.get(c.api);
                if (!d) continue;
                const v = "close" in d ? d.close : "value" in d ? d.value : null;
                if (typeof v !== "number") continue;
                rows.push({ key: c.meta.key, label: c.meta.label, color: c.meta.color, value: v });
            }
            if (rows.length === 0) return null;
            // 크로스헤어 y = 정규화 % 그 자체(축이 % 공간이라 변환이 없다).
            const first = createdRef.current[0];
            const cursorPct = first && param.point ? first.api.coordinateToPrice(param.point.y) : null;
            // 시선을 맨 위에, 나머지는 |값| 내림차순 — 뭉친 데서 큰 것부터 읽힌다.
            rows.sort((a, b) => Number(b.key === emphasizedKey(createdRef.current)) - Number(a.key === emphasizedKey(createdRef.current)) || Math.abs(b.value) - Math.abs(a.value));
            return (
                <div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 5 }}>{fmtNormX(t, xKindRef.current)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 12px", fontSize: 11, fontWeight: 600 }}>
                        {rows.slice(0, 12).map((r) => (
                            <div key={r.key} style={{ display: "contents" }}>
                                <div style={{ color: r.color, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(r.value)}</div>
                            </div>
                        ))}
                        {rows.length > 12 && <div style={{ color: "var(--text-tertiary)" }}>… 외 {rows.length - 12}</div>}
                    </div>
                    {renderExtra?.(t, rows, typeof cursorPct === "number" ? cursorPct : null)}
                </div>
            );
        },
    });

    return (
        <div ref={containerRef} onMouseMove={onCursorMove} style={{ position: "relative", width: "100%", height: "100%" }}>
            {tip.visible && <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>{tip.content}</FloatingTooltip>}
        </div>
    );
}

const emphasizedKey = (created: readonly Created[]): string | null =>
    created.find((c) => c.meta.emphasized)?.meta.key ?? null;
