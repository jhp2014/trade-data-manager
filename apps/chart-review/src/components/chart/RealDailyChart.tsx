"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, HistogramSeries, CrosshairMode, LineStyle, createSeriesMarkers, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type Time } from "lightweight-charts";
import type { DailyCandle } from "@/types/chart";
import { kstYmd, highMarkerColor } from "@trade-data-manager/chart-utils";
import { AMOUNT_MIL_TO_EOK } from "@/lib/constants";
import { RISE_COLOR, FALL_COLOR, RISE_FILL, FALL_FILL, AMOUNT_BAR_COLOR } from "@/lib/colors";
import { configureAmountPane } from "@/lib/chart/panes";
import { useUiStore } from "@/stores/useUiStore";
import { useChartShell } from "./shell/useChartShell";
import { baseChartOptions } from "./shell/chartOptions";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { DailyTooltip } from "./tooltip/DailyTooltip";
import { buildPriceLineOptions, computePriceLineChartValue } from "@/lib/chart/priceLines";

interface Props {
    candles: DailyCandle[];
    priceLines?: Record<string, number[]>;
}

function fmtEok(v: number) {
    if (v >= 10000) return `${(v / 10000).toFixed(2)}조`;
    if (v >= 1) return `${v.toFixed(1)}억`;
    if (v >= 0.0001) return `${(v * 10000).toFixed(0)}만`;
    return v.toLocaleString();
}

export function RealDailyChart({ candles, priceLines }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    const mode = useUiStore((s) => s.chartPriceMode);

    const chartRef = useChartShell(containerRef, () => ({
        ...baseChartOptions(),
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.5)", style: LineStyle.Dotted, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.5)", style: LineStyle.Dotted, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.08 } },
        leftPriceScale: { visible: false },
        timeScale: {
            borderVisible: false, barSpacing: 3, rightOffset: 10,
            tickMarkFormatter: (t: number) => kstYmd(t).slice(5),
        },
        localization: { locale: "ko-KR", timeFormatter: (t: number) => kstYmd(t) },
    }));

    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const dataMapRef = useRef<Map<number, DailyCandle>>(new Map());
    const baseCandleRef = useRef<DailyCandle | null>(null);
    const priceLineHandlesRef = useRef<IPriceLine[]>([]);
    const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

    // 시리즈 생성 (마운트 1회)
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: RISE_COLOR, downColor: FALL_COLOR,
            borderUpColor: RISE_COLOR, borderDownColor: FALL_COLOR,
            wickUpColor: RISE_COLOR, wickDownColor: FALL_COLOR,
            priceScaleId: "right", priceLineVisible: false, lastValueVisible: false,
            priceFormat: { type: "price", precision: 0, minMove: 1 },
        });
        // 거래대금은 별도 pane(1)으로 분리해 캔들과 스케일이 섞이지 않게 한다.
        const amountSeries = chart.addSeries(HistogramSeries, {
            priceScaleId: "right",
            priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}억`, minMove: 0.1 },
            color: AMOUNT_BAR_COLOR,
        }, 1);
        configureAmountPane(chart);

        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;
        // 마커 플러그인을 캔들 시리즈와 한 생명주기로 생성(아래 cleanup에서 함께 폐기)
        markersApiRef.current = createSeriesMarkers(candleSeries);

        return () => {
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
            // 시리즈가 사라지면 마커 플러그인 핸들도 폐기(StrictMode 리마운트 시 죽은 시리즈 참조 방지)
            markersApiRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { state: tipState } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const candleSeries = candleSeriesRef.current;
            if (!candleSeries || !param.time) return null;

            const t = param.time as number;
            const candle = dataMapRef.current.get(t);
            if (!candle) return null;

            const useNxt = mode === "nxt";
            const cursorPrice = candleSeries.coordinateToPrice(param.point!.y);
            const base = baseCandleRef.current;

            const hoverHigh = useNxt ? candle.nxt.high : candle.krx.high;
            const hoverHighKrxPct = candle.prevCloseKrx && candle.prevCloseKrx > 0
                ? ((hoverHigh - candle.prevCloseKrx) / candle.prevCloseKrx) * 100 : null;
            const hoverHighNxtPct = candle.prevCloseNxt && candle.prevCloseNxt > 0
                ? ((hoverHigh - candle.prevCloseNxt) / candle.prevCloseNxt) * 100 : null;

            const cursorKrxPct = cursorPrice != null && Number.isFinite(cursorPrice) && base?.prevCloseKrx
                ? ((cursorPrice - base.prevCloseKrx) / base.prevCloseKrx) * 100 : null;
            const cursorNxtPct = cursorPrice != null && Number.isFinite(cursorPrice) && base?.prevCloseNxt
                ? ((cursorPrice - base.prevCloseNxt) / base.prevCloseNxt) * 100 : null;
            const cursorAmountEok = candle.amountKrx != null ? fmtEok(candle.amountKrx / AMOUNT_MIL_TO_EOK) : null;

            return (
                <DailyTooltip
                    time={t}
                    cursorKrxPct={cursorKrxPct}
                    cursorNxtPct={cursorNxtPct}
                    hoverHighKrxPct={hoverHighKrxPct}
                    hoverHighNxtPct={hoverHighNxtPct}
                    hoverHigh={hoverHigh}
                    cursorAmountEok={cursorAmountEok}
                />
            );
        },
    });

    // 데이터 갱신 (mode 전환 시에도 재실행)
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        const useNxt = mode === "nxt";
        const map = new Map<number, DailyCandle>();

        candleSeries.setData(candles.map((c) => {
            map.set(c.time, c);
            const ohlc = useNxt ? c.nxt : c.krx;
            return { time: c.time as Time, ...ohlc };
        }));
        dataMapRef.current = map;
        baseCandleRef.current = candles.length > 0 ? candles[candles.length - 1] : null;

        amountSeries.setData(
            candles.filter((c) => {
                const amt = useNxt ? c.amountNxt : c.amountKrx;
                return amt != null;
            }).map((c) => {
                const amt = useNxt ? (c.amountNxt as number) : (c.amountKrx as number);
                const ohlc = useNxt ? c.nxt : c.krx;
                return {
                    time: c.time as Time,
                    value: amt / AMOUNT_MIL_TO_EOK,
                    color: ohlc.close >= ohlc.open ? RISE_FILL : FALL_FILL,
                };
            }),
        );

        // 고가 마커: 분모는 항상 KRX 전일 종가 (ADR-009 정책 유지)
        const markers: Array<{ time: Time; position: "aboveBar"; color: string; shape: "circle"; text: string }> = [];
        for (const c of candles) {
            if (!c.prevCloseKrx || c.prevCloseKrx <= 0) continue;
            const high = useNxt ? c.nxt.high : c.krx.high;
            const pct = ((high - c.prevCloseKrx) / c.prevCloseKrx) * 100;
            const color = highMarkerColor(pct);
            if (color) {
                markers.push({
                    time: c.time as Time,
                    position: "aboveBar",
                    color,
                    shape: "circle",
                    text: `+${pct.toFixed(1)}`,
                });
            }
        }
        markersApiRef.current?.setMarkers(markers);
        // 기본 뷰: 마지막 약 168 거래일(≈8개월) + 우측 5% 여백. 전체보다 적으면 전체 표시.
        const ts = chartRef.current?.timeScale();
        if (ts) {
            const VISIBLE_BARS = 168;
            const rightGap = Math.round(VISIBLE_BARS * 0.05); // ≈8봉
            if (candles.length <= VISIBLE_BARS) {
                ts.setVisibleLogicalRange({ from: 0, to: candles.length - 1 + rightGap });
            } else {
                ts.setVisibleLogicalRange({
                    from: candles.length - VISIBLE_BARS,
                    to: candles.length - 1 + rightGap,
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, mode]);

    // 가격 라인 (일봉: 가격 그대로, candleSeries에 직접 부착)
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        for (const line of priceLineHandlesRef.current) {
            try { candleSeries.removePriceLine(line); } catch { /* noop */ }
        }
        priceLineHandlesRef.current = [];

        if (!priceLines) return;
        for (const [key, prices] of Object.entries(priceLines)) {
            if (!prices || prices.length === 0) continue;
            for (const price of prices) {
                const chartValue = computePriceLineChartValue(price, null, true);
                if (chartValue === null) continue;
                try {
                    const handle = candleSeries.createPriceLine(buildPriceLineOptions(key, price, chartValue, true));
                    priceLineHandlesRef.current.push(handle);
                } catch { /* noop */ }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(priceLines)]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <ChartTooltip
                visible={tipState.visible}
                x={tipState.x}
                y={tipState.y}
                containerRef={containerRef}
                minWidth={220}
            >
                {tipState.content}
            </ChartTooltip>
        </div>
    );
}
