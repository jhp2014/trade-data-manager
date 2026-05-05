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

const fmtAmount = (v: number) => {
    if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
    return v.toFixed(0);
};

export function RealMinuteChart({ candles, height = 680, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    // time -> 누적거래대금 매핑 (분봉엔 직접 없으므로 setData 시 누적 계산)
    const cumAmountMapRef = useRef<Map<number, number>>(new Map());
    const amountMapRef = useRef<Map<number, number>>(new Map());

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
                // 가로/세로 모두 표시
                vertLine: {
                    visible: true,
                    width: 1,
                    color: "rgba(180,180,180,0.7)",
                    style: LineStyle.Solid,
                    labelVisible: true,
                },
                horzLine: {
                    visible: true,
                    width: 1,
                    color: "rgba(180,180,180,0.5)",
                    style: LineStyle.Dashed,
                    labelVisible: true,
                },
            },
            // 우측: 등락률(%)
            rightPriceScale: {
                visible: true,
                borderVisible: false,
                scaleMargins: { top: 0.04, bottom: 0.30 },
            },
            // 좌측: 거래대금
            leftPriceScale: {
                visible: true,
                borderVisible: false,
                scaleMargins: { top: 0.75, bottom: 0 },
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

        // 거래대금 히스토그램 — 좌측 priceScale 사용
        const amountSeries = chart.addHistogramSeries({
            priceScaleId: "left",
            priceFormat: {
                type: "custom",
                formatter: (v: number) => fmtAmount(v),
                minMove: 1,
            },
            color: "rgba(120,120,140,0.5)",
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;

        // 마우스 추적 모달
        chart.subscribeCrosshairMove((param) => {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            if (!tip || !c) return;

            if (
                !param.point ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > c.clientWidth ||
                param.point.y < 0 ||
                param.point.y > c.clientHeight
            ) {
                tip.style.display = "none";
                return;
            }

            const data = param.seriesData.get(candleSeries) as
                | { open?: number; high?: number; low?: number; close?: number }
                | undefined;
            if (!data || data.close === undefined) {
                tip.style.display = "none";
                return;
            }

            const t = param.time as number;
            const v = data.close;
            const color = v >= 0 ? "#ef4444" : "#3b82f6";
            const amount = amountMapRef.current.get(t) ?? 0;
            const cumAmount = cumAmountMapRef.current.get(t) ?? 0;

            tip.innerHTML = `
                <div style="font-size:11px;color:#a0a0a0;margin-bottom:6px">${kstHHmm(t)}</div>
                <div style="display:grid;grid-template-columns:auto auto;gap:4px 12px;font-size:12px">
                  <div style="color:#a0a0a0">등락률</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums;color:${color};font-weight:600">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</div>
                  <div style="color:#a0a0a0">분거래대금</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtAmount(amount)}</div>
                  <div style="color:#a0a0a0">누적</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtAmount(cumAmount)}</div>
                </div>
            `;
            tip.style.display = "block";

            // 마우스 근처 위치, 가장자리 회피
            const TW = tip.offsetWidth || 180;
            const TH = tip.offsetHeight || 100;
            const M = 12;
            let left = param.point.x + M;
            if (left + TW > c.clientWidth) left = param.point.x - M - TW;
            if (left < 0) left = M;
            let top = param.point.y + M;
            if (top + TH > c.clientHeight) top = param.point.y - M - TH;
            if (top < 0) top = M;
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
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

        // amount + 누적 누적
        const amountMap = new Map<number, number>();
        const cumMap = new Map<number, number>();
        const amountData: Array<{ time: Time; value: number; color: string }> = [];
        let cum = 0;
        for (const c of candles) {
            const a = c.amount ?? 0;
            cum += a;
            amountMap.set(c.time, a);
            cumMap.set(c.time, cum);
            if (c.amount != null) {
                amountData.push({
                    time: c.time as Time,
                    value: a,
                    color:
                        c.close >= c.open
                            ? "rgba(239,68,68,0.5)"
                            : "rgba(59,130,246,0.5)",
                });
            }
        }
        amountMapRef.current = amountMap;
        cumAmountMapRef.current = cumMap;
        amountSeries.setData(amountData);

        chartRef.current?.timeScale().fitContent();
    }, [candles]);

    // 진입 시점 마커
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series || markerTime == null) return;

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
                ref={tooltipRef}
                style={{
                    position: "absolute",
                    display: "none",
                    pointerEvents: "none",
                    padding: "10px 12px",
                    background: "rgba(20,20,24,0.95)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 6,
                    color: "#fff",
                    zIndex: 10,
                    fontFamily: "inherit",
                    minWidth: 180,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}
            />
        </div>
    );
}
