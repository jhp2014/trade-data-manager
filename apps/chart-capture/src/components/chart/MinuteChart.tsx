"use client";

import { useEffect, useRef } from "react";
import {
    createChart,
    CrosshairMode,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type IPriceLine,
    type Time,
} from "lightweight-charts";
import type { MinuteCandle } from "@/lib/chartTypes";
import type { LineSpec } from "@/types/capture";
import { kstHHmm } from "@/lib/chartTime";
import { computePriceLineChartValue, buildPriceLineOptions } from "@/lib/chart/priceLines";

interface Props {
    candles: MinuteCandle[];
    variant: "KRX" | "NXT";
    priceLines: LineSpec[];
    prevCloseKrx: number | null;
    prevCloseNxt: number | null;
    onReady: () => void;
}

const AMOUNT_KRW_TO_EOK = 1e8;

export function MinuteChart({ candles, variant, priceLines, prevCloseKrx, prevCloseNxt, onReady }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const priceLineHandlesRef = useRef<IPriceLine[]>([]);
    const onReadyCalled = useRef(false);

    // 차트 인스턴스 생성 (마운트 1회)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            width: container.clientWidth || 800,
            height: container.clientHeight || 400,
            layout: { background: { color: "#ffffff" }, textColor: "#6b7280", fontSize: 11 },
            grid: {
                vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
                horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
            },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.04, bottom: 0.30 } },
            leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.75, bottom: 0 } },
            timeScale: {
                borderVisible: false,
                rightOffset: 2,
                tickMarkFormatter: (t: number) => kstHHmm(t),
            },
            handleScroll: false,
            handleScale: false,
            localization: { locale: "ko-KR", timeFormatter: (t: number) => kstHHmm(t) },
        });
        chartRef.current = chart;

        const candleSeries = chart.addCandlestickSeries({
            upColor: "#ef4444", downColor: "#3b82f6",
            borderUpColor: "#ef4444", borderDownColor: "#3b82f6",
            wickUpColor: "#ef4444", wickDownColor: "#3b82f6",
            priceScaleId: "right", priceLineVisible: false,
            priceFormat: { type: "custom", formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`, minMove: 0.01 },
        });
        candleSeries.createPriceLine({
            price: 0, color: "rgba(150,150,150,0.5)", lineStyle: LineStyle.Dashed,
            lineWidth: 1, axisLabelVisible: false, title: "",
        });

        const amountSeries = chart.addHistogramSeries({
            priceScaleId: "left",
            priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}억`, minMove: 1 },
            priceLineVisible: false, lastValueVisible: false,
            color: "rgba(120,120,140,0.5)",
        });
        chart.priceScale("left").applyOptions({ visible: true, borderVisible: false, scaleMargins: { top: 0.75, bottom: 0 } });

        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;

        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        });
        ro.observe(container);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 데이터 세팅 + onReady 호출
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        const useNxt = variant === "NXT";

        candleSeries.setData(candles.map((c) => {
            const ohlc = useNxt ? c.nxt : c.krx;
            return { time: c.time as Time, open: ohlc.open, high: ohlc.high, low: ohlc.low, close: ohlc.close };
        }));

        const amountData: Array<{ time: Time; value: number; color: string }> = [];
        for (const c of candles) {
            const a = c.amount ?? 0;
            if (c.amount != null && a > 0) {
                const ohlc = useNxt ? c.nxt : c.krx;
                amountData.push({
                    time: c.time as Time,
                    value: a / AMOUNT_KRW_TO_EOK,
                    color: ohlc.close >= ohlc.open ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
                });
            }
        }
        amountSeries.setData(amountData);
        chartRef.current?.timeScale().fitContent();

        if (!onReadyCalled.current) {
            onReadyCalled.current = true;
            requestAnimationFrame(() => onReady());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, variant]);

    // 가격 라인 (분봉: prevClose 기준 % 변환)
    const prevClose = variant === "NXT" ? prevCloseNxt : prevCloseKrx;
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        for (const line of priceLineHandlesRef.current) {
            try { candleSeries.removePriceLine(line); } catch { /* noop */ }
        }
        priceLineHandlesRef.current = [];

        if (prevClose == null || prevClose <= 0) return;

        for (const spec of priceLines) {
            for (const price of spec.values) {
                const chartValue = computePriceLineChartValue(price, prevClose, false);
                if (chartValue === null) continue;
                try {
                    const handle = candleSeries.createPriceLine(
                        buildPriceLineOptions(spec.color, spec.column.replace("line_", ""), chartValue),
                    );
                    priceLineHandlesRef.current.push(handle);
                } catch { /* noop */ }
            }
        }
    }, [priceLines, prevClose]);

    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
