"use client";

import { useEffect, useRef } from "react";
import { CrosshairMode, LineStyle, type IPriceLine, type ISeriesApi, type Time } from "lightweight-charts";
import type { DailyCandle } from "@/types/chart";
import { kstYmd } from "@/lib/chartTime";
import { HIGH_MARKER_MIN_PCT, AMOUNT_MIL_TO_EOK } from "@/lib/constants";
import { useUiStore } from "@/stores/useUiStore";
import { useChartShell } from "./shell/useChartShell";
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

function highMarkerColor(pct: number): string | null {
    if (pct < HIGH_MARKER_MIN_PCT) return null;
    if (pct < 15) return "#fbbf24";
    if (pct < 20) return "#fb923c";
    if (pct < 25) return "#ef4444";
    if (pct < 30) return "#a855f7";
    return "#7c3aed";
}

export function RealDailyChart({ candles, priceLines }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    const mode = useUiStore((s) => s.chartPriceMode);

    const chartRef = useChartShell(containerRef, () => ({
        layout: { background: { color: "transparent" }, textColor: "#6b7280", fontSize: 11 },
        grid: {
            vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
            horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.5)", style: LineStyle.Dotted, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.5)", style: LineStyle.Dotted, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.30 } },
        leftPriceScale: { visible: false, borderVisible: false, scaleMargins: { top: 0.75, bottom: 0 } },
        timeScale: {
            borderVisible: false, barSpacing: 3, rightOffset: 4,
            tickMarkFormatter: (t: number) => kstYmd(t).slice(5),
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: { locale: "ko-KR", timeFormatter: (t: number) => kstYmd(t) },
    }));

    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const dataMapRef = useRef<Map<number, DailyCandle>>(new Map());
    const baseCandleRef = useRef<DailyCandle | null>(null);
    const priceLineHandlesRef = useRef<IPriceLine[]>([]);

    // 시리즈 생성 (마운트 1회)
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        const candleSeries = chart.addCandlestickSeries({
            upColor: "#ef4444", downColor: "#3b82f6",
            borderUpColor: "#ef4444", borderDownColor: "#3b82f6",
            wickUpColor: "#ef4444", wickDownColor: "#3b82f6",
            priceScaleId: "right", priceLineVisible: false, lastValueVisible: false,
            priceFormat: { type: "price", precision: 0, minMove: 1 },
        });
        const amountSeries = chart.addHistogramSeries({
            priceScaleId: "amount",
            priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}억`, minMove: 0.1 },
            color: "rgba(120,120,140,0.5)",
        });
        chart.priceScale("amount").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;

        return () => {
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
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
                    cursorAmountEok={cursorAmountEok}
                />
            );
        },
        leftOffset: () => chartRef.current?.priceScale("left").width() ?? 0,
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
                    color: ohlc.close >= ohlc.open ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
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
        candleSeries.setMarkers(markers);
        chartRef.current?.timeScale().fitContent();
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
                leftOffset={tipState.leftOffset}
                minWidth={220}
            >
                {tipState.content}
            </ChartTooltip>
        </div>
    );
}
