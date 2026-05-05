"use client";

import { useEffect, useRef } from "react";
import {
    createChart,
    CrosshairMode,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from "lightweight-charts";
import type { ChartCandle } from "@/actions/chartPreview";
import { kstHHmm } from "@/lib/chartTime";

interface Props {
    candles: ChartCandle[];
    height?: number;
    markerTime?: number | null;
}

export function RealMinuteChart({ candles, height = 680, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const labelRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            width: container.clientWidth,
            height,
            layout: {
                background: { color: "transparent" },
                textColor: "#a0a0a0",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: "rgba(255,255,255,0.04)" },
                horzLines: { color: "rgba(255,255,255,0.04)" },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                // 가로선 숨김
                horzLine: {
                    visible: false,
                    labelVisible: false,
                },
                // 세로선만 강조
                vertLine: {
                    visible: true,
                    width: 1,
                    color: "rgba(180,180,180,0.7)",
                    style: LineStyle.Solid,
                    labelVisible: true,
                },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.04, bottom: 0.30 },
            },
            timeScale: {
                borderVisible: false,
                rightOffset: 2,
                tickMarkFormatter: (t: number) => kstHHmm(t),
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: false,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
            localization: {
                locale: "ko-KR",
                timeFormatter: (t: number) => kstHHmm(t),
                priceFormatter: (p: number) =>
                    `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
            },
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: "#ef4444",
            downColor: "#3b82f6",
            borderUpColor: "#ef4444",
            borderDownColor: "#3b82f6",
            wickUpColor: "#ef4444",
            wickDownColor: "#3b82f6",
            priceFormat: {
                type: "custom",
                formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
                minMove: 0.01,
            },
        });

        // 0% 기준선
        candleSeries.createPriceLine({
            price: 0,
            color: "rgba(150,150,150,0.5)",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: false,
            title: "",
        });

        // 거래대금 히스토그램 (별도 priceScale)
        const amountSeries = chart.addHistogramSeries({
            priceScaleId: "amount",
            priceFormat: { type: "volume" },
            color: "rgba(120,120,140,0.5)",
        });
        chart
            .priceScale("amount")
            .applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;

        // 상단 라벨: "+12.34% · 14:35"
        chart.subscribeCrosshairMove((param) => {
            const label = labelRef.current;
            const c = containerRef.current;
            if (!label || !c) return;

            if (
                !param.point ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > c.clientWidth
            ) {
                label.style.display = "none";
                return;
            }

            const data = param.seriesData.get(candleSeries) as
                | { close?: number; value?: number }
                | undefined;
            if (!data) {
                label.style.display = "none";
                return;
            }

            const v = data.close ?? data.value ?? 0;
            const t = param.time as number;
            const color = v >= 0 ? "#ef4444" : "#3b82f6";
            label.innerHTML = `<span style="color:${color};font-weight:600">${v >= 0 ? "+" : ""
                }${v.toFixed(2)}%</span> <span style="color:#a0a0a0;margin-left:8px">${kstHHmm(t)}</span>`;
            label.style.display = "block";
        });

        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({ width: containerRef.current.clientWidth });
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
    }, [height]);

    // 데이터 갱신
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        const candleData = candles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));
        candleSeries.setData(candleData);

        const amountData = candles
            .filter((c) => c.amount != null)
            .map((c) => ({
                time: c.time as Time,
                value: c.amount as number,
                color:
                    c.close >= c.open
                        ? "rgba(239,68,68,0.5)"
                        : "rgba(59,130,246,0.5)",
            }));
        amountSeries.setData(amountData);

        chartRef.current?.timeScale().fitContent();
    }, [candles]);

    // 진입 시점 마커 (세로선 형태로 priceLine 대신 시간축 마커)
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series || markerTime == null) return;

        // 진입 분의 캔들에 작은 화살표 마커
        series.setMarkers([
            {
                time: markerTime as Time,
                position: "aboveBar",
                color: "#fbbf24",
                shape: "arrowDown",
                text: "진입",
            },
        ]);
    }, [markerTime, candles]);

    return (
        <div
            ref={containerRef}
            style={{ position: "relative", width: "100%", height }}
        >
            <div
                ref={labelRef}
                style={{
                    position: "absolute",
                    top: 6,
                    left: 12,
                    display: "none",
                    pointerEvents: "none",
                    padding: "4px 10px",
                    background: "rgba(20,20,24,0.85)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                    zIndex: 10,
                }}
            />
        </div>
    );
}
