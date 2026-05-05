"use client";

import { useEffect, useRef } from "react";
import {
    createChart,
    ColorType,
    CrosshairMode,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from "lightweight-charts";
import type { ChartCandle } from "@/actions/chartPreview";

interface Props {
    candles: ChartCandle[];
    height: number;
    markerTime?: number | null;
}

export function RealMinuteChart({ candles, height, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;

        const chart = createChart(el, {
            width: el.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "#8b95a1",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: "#f2f4f6" },
                horzLines: { color: "#f2f4f6" },
            },
            rightPriceScale: {
                borderColor: "#e5e8eb",
            },
            timeScale: {
                borderColor: "#e5e8eb",
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: { mode: CrosshairMode.Normal },
        });
        const series = chart.addCandlestickSeries({
            upColor: "#f04452",
            downColor: "#1b64da",
            borderUpColor: "#f04452",
            borderDownColor: "#1b64da",
            wickUpColor: "#f04452",
            wickDownColor: "#1b64da",
            priceFormat: {
                type: "custom",
                minMove: 0.01,
                formatter: (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(2)}%`,
            },
        });

        // 0% 기준선
        series.createPriceLine({
            price: 0,
            color: "#8b95a1",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "0%",
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const ro = new ResizeObserver(() => {
            if (chartRef.current && containerRef.current) {
                chartRef.current.applyOptions({
                    width: containerRef.current.clientWidth,
                });
            }
        });
        ro.observe(el);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [height]);

    useEffect(() => {
        if (!seriesRef.current || !chartRef.current) return;
        const data = candles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));
        seriesRef.current.setData(data);

        if (markerTime != null) {
            seriesRef.current.setMarkers([
                {
                    time: markerTime as Time,
                    position: "aboveBar",
                    color: "#3182f6",
                    shape: "arrowDown",
                    text: "",
                },
            ]);
        } else {
            seriesRef.current.setMarkers([]);
        }

        chartRef.current.timeScale().fitContent();
    }, [candles, markerTime]);

    return <div ref={containerRef} style={{ width: "100%", height }} />;
}
