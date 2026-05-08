"use client";

import { useEffect, useMemo, useRef } from "react";
import { CrosshairMode, LineStyle, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartCandle, ChartOverlaySeries } from "@/types/chart";
import { kstHHmm } from "@/lib/chartTime";
import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";
import { useChartShell } from "./shell/useChartShell";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { MinuteTooltip } from "./tooltip/MinuteTooltip";
import type { OverlayTooltipRow } from "./tooltip/ThemeRowList";
import { SELF_COLOR, PALETTE, assignSeriesColors } from "@/lib/chart/overlay";
import { EntryMarker } from "./marker/EntryMarker";

interface Props {
    candles: ChartCandle[];
    markerTime?: number | null;
    themeOverlay?: ChartOverlaySeries[];
}

export function RealMinuteChart({ candles, markerTime, themeOverlay }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    const chartRef = useChartShell(containerRef, () => ({
        layout: { background: { color: "transparent" }, textColor: "#6b7280", fontSize: 11 },
        grid: {
            vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
            horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { visible: true, width: 1, color: "rgba(60,60,60,0.6)", style: 0, labelVisible: true },
            horzLine: { visible: true, width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dashed, labelVisible: true },
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

    // themeOverlay 변경 시 time → point lookup Map을 미리 구성 (hover 시 O(1) 조회)
    const overlayLookup = useMemo((): Map<string, Map<number, { value: number; amount: number; cumAmount: number }>> => {
        const outer = new Map<string, Map<number, { value: number; amount: number; cumAmount: number }>>();
        for (const s of themeOverlay ?? []) {
            const inner = new Map<number, { value: number; amount: number; cumAmount: number }>();
            for (const p of s.series) {
                inner.set(p.time, { value: p.value, amount: p.amount, cumAmount: p.cumAmount });
            }
            outer.set(s.stockCode, inner);
        }
        return outer;
    }, [themeOverlay]);

    const colorMap = useMemo(() => assignSeriesColors(themeOverlay ?? []), [themeOverlay]);

    // self 종목 정보 (themeOverlay에서 첫 번째 self 시리즈 추출)
    const selfSeries = useMemo(() => (themeOverlay ?? []).find((s) => s.isSelf) ?? null, [themeOverlay]);

    // 시리즈 생성 (마운트 1회)
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
            const t = param.time as number | undefined;
            if (t === undefined) return null;

            const data = param.seriesData.get(candleSeriesRef.current!) as
                | { open?: number; high?: number; low?: number; close?: number }
                | undefined;
            if (!data || data.close === undefined) return null;

            // 자기 종목 행
            const selfRow: OverlayTooltipRow = {
                stockCode: selfSeries?.stockCode ?? "",
                stockName: selfSeries?.stockName ?? "",
                color: SELF_COLOR,
                isSelf: true,
                rate: data.close,
                amount: amountMapRef.current.get(t) ?? 0,
                cumAmount: cumAmountMapRef.current.get(t) ?? 0,
            };

            // peers 행 (themeOverlay의 non-self 시리즈에서 lookup)
            const peerRows: OverlayTooltipRow[] = [];
            for (const s of themeOverlay ?? []) {
                if (s.isSelf) continue;
                const pt = overlayLookup.get(s.stockCode)?.get(t);
                if (!pt) continue;
                peerRows.push({
                    stockCode: s.stockCode,
                    stockName: s.stockName,
                    color: colorMap.get(s.stockCode) ?? PALETTE[0],
                    isSelf: false,
                    rate: pt.value,
                    amount: pt.amount,
                    cumAmount: pt.cumAmount,
                });
            }
            peerRows.sort((a, b) => b.rate - a.rate);

            return <MinuteTooltip time={t} rows={[selfRow, ...peerRows]} />;
        },
        leftOffset: () => chartRef.current?.priceScale("left").width() ?? 0,
    });

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
            <ChartTooltip
                visible={tipState.visible}
                x={tipState.x}
                y={tipState.y}
                containerRef={containerRef}
                leftOffset={tipState.leftOffset}
                minWidth={180}
                maxWidth={420}
            >
                {tipState.content}
            </ChartTooltip>
            <EntryMarker
                chartRef={chartRef}
                containerRef={containerRef}
                time={markerTime}
                dataKey={candles}
            />
        </div>
    );
}
