"use client";

import { useEffect, useRef } from "react";
import { CrosshairMode, LineStyle, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartCandle } from "@/actions/chartPreview";
import { kstHHmm } from "@/lib/chartTime";
import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";
import { useChartShell } from "./shell/useChartShell";
import { positionTooltip, TOOLTIP_STYLE } from "./shell/tooltipUtils";

interface Props {
    candles: ChartCandle[];
    markerTime?: number | null;
}

function fmtAmount(v: number) {
    if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
    return v.toFixed(0);
}

export function RealMinuteChart({ candles, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const chartRef = useChartShell(containerRef, () => ({
        layout: { background: { color: "transparent" }, textColor: "#a0a0a0", fontSize: 11 },
        grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { visible: true, width: 1, color: "rgba(180,180,180,0.7)", style: 0, labelVisible: true },
            horzLine: { visible: true, width: 1, color: "rgba(180,180,180,0.5)", style: LineStyle.Dashed, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.04, bottom: 0.30 } },
        leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.75, bottom: 0 } },
        timeScale: {
            borderVisible: false, rightOffset: 2,
            tickMarkFormatter: (t: number) => kstHHmm(t),
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: { locale: "ko-KR", timeFormatter: (t: number) => kstHHmm(t) },
    }));

    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const cumAmountMapRef = useRef<Map<number, number>>(new Map());
    const amountMapRef = useRef<Map<number, number>>(new Map());

    // 시리즈 생성 + 툴팁 구독 (마운트 1회)
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

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

        chart.subscribeCrosshairMove((param) => {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            if (!tip || !c) return;

            if (!param.point || !param.time ||
                param.point.x < 0 || param.point.x > c.clientWidth ||
                param.point.y < 0 || param.point.y > c.clientHeight) {
                tip.style.display = "none";
                return;
            }

            const data = param.seriesData.get(candleSeries) as
                | { open?: number; high?: number; low?: number; close?: number }
                | undefined;
            if (!data || data.close === undefined) { tip.style.display = "none"; return; }

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
                </div>`;
            tip.style.display = "block";

            const leftW = chart.priceScale("left").width();
            positionTooltip(tip, c, param.point.x + leftW, param.point.y);
        });

        return () => {
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 데이터 갱신
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        candleSeries.setData(candles.map((c) => ({
            time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
        })));

        const amountMap = new Map<number, number>();
        const cumMap = new Map<number, number>();
        const amountData: Array<{ time: Time; value: number; color: string }> = [];
        for (const c of candles) {
            const a = c.amount ?? 0;
            amountMap.set(c.time, a);
            cumMap.set(c.time, c.accAmount ?? 0);
            if (c.amount != null && a > 0) {
                amountData.push({
                    time: c.time as Time,
                    value: a / AMOUNT_KRW_TO_EOK,
                    color: c.close >= c.open ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
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
        series.setMarkers([{ time: markerTime as Time, position: "aboveBar", color: "#fbbf24", shape: "arrowDown", text: "진입" }]);
    }, [markerTime, candles]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div ref={tooltipRef} style={{ ...TOOLTIP_STYLE, minWidth: 180 }} />
        </div>
    );
}
