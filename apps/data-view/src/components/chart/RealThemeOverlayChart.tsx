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
import type { ChartOverlaySeries } from "@/actions/chartPreview";

interface Props {
    data: ChartOverlaySeries[];
    height: number;
    markerTime?: number | null;
}

const COLORS = [
    "#3182f6",
    "#f04452",
    "#1b64da",
    "#f59e0b",
    "#10b981",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
];

export function RealThemeOverlayChart({ data, height, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRefs = useRef<ISeriesApi<"Line">[]>([]);

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
            localization: {
                priceFormatter: (p: number) =>
                    `${p > 0 ? "+" : ""}${p.toFixed(2)}%`,
            },
        });
        chartRef.current = chart;

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
            seriesRefs.current = [];
        };
    }, [height]);

    useEffect(() => {
        if (!chartRef.current) return;

        for (const s of seriesRefs.current) {
            chartRef.current.removeSeries(s);
        }
        seriesRefs.current = [];

        // 0% baseline
        const baseline = chartRef.current.addLineSeries({
            color: "#d1d6db",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });
        const allPoints = data.flatMap((d) => d.series);
        if (allPoints.length > 0) {
            const minT = Math.min(...allPoints.map((p) => p.time));
            const maxT = Math.max(...allPoints.map((p) => p.time));
            baseline.setData([
                { time: minT as Time, value: 0 },
                { time: maxT as Time, value: 0 },
            ]);
        }
        seriesRefs.current.push(baseline);

        data.forEach((d, idx) => {
            const color = COLORS[idx % COLORS.length];
            const s = chartRef.current!.addLineSeries({
                color,
                lineWidth: d.isSelf ? 3 : 1,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
            });
            s.setData(
                d.series.map((p) => ({
                    time: p.time as Time,
                    value: p.value,
                }))
            );
            if (d.isSelf && markerTime != null) {
                s.setMarkers([
                    {
                        time: markerTime as Time,
                        position: "aboveBar",
                        color: "#3182f6",
                        shape: "arrowDown",
                        text: "",
                    },
                ]);
            }
            seriesRefs.current.push(s);
        });

        chartRef.current.timeScale().fitContent();
    }, [data, markerTime]);

    return <div ref={containerRef} style={{ width: "100%", height }} />;
}
