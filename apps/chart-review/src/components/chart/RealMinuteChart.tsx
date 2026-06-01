"use client";

import { useMemo, useRef } from "react";
import { CrosshairMode, LineStyle } from "lightweight-charts";
import type { MinuteCandle, ChartOverlaySeries } from "@/types/chart";
import { kstHHmm } from "@trade-data-manager/chart-utils";
import { useUiStore } from "@/stores/useUiStore";
import { useChartShell } from "./shell/useChartShell";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { MinuteTooltip } from "./tooltip/MinuteTooltip";
import type { OverlayTooltipRow } from "./tooltip/ThemeRowList";
import { assignSeriesColors } from "@/lib/chart/overlay";
import { OVERLAY_SELF_COLOR, OVERLAY_PEER_PALETTE } from "@/lib/colors";
import { useMinuteChartSeries } from "./hooks/useMinuteChartSeries";
import { useMinuteChartData } from "./hooks/useMinuteChartData";
import { useMinuteChartMarkers } from "./hooks/useMinuteChartMarkers";
import { useMinuteChartPriceLines } from "./hooks/useMinuteChartPriceLines";

interface Props {
    candles: MinuteCandle[];
    markerTime?: number | null;
    themeOverlay?: ChartOverlaySeries[];
    priceLines?: Record<string, number[]>;
    prevCloseKrx?: number | null;
    prevCloseNxt?: number | null;
}

export function RealMinuteChart({ candles, markerTime, themeOverlay, priceLines, prevCloseKrx, prevCloseNxt }: Props) {
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
            vertLine: { visible: true, width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dashed, labelVisible: true },
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

    const { candleSeriesRef, amountSeriesRef } = useMinuteChartSeries(chartRef);

    const { amountMapRef, cumAmountMapRef } = useMinuteChartData({
        chartRef,
        candleSeriesRef,
        amountSeriesRef,
        candles,
        mode,
    });

    useMinuteChartMarkers({ candleSeriesRef, candles, markerTime });

    const prevClose = mode === "nxt" ? (prevCloseNxt ?? null) : (prevCloseKrx ?? null);
    useMinuteChartPriceLines({ candleSeriesRef, priceLines, prevClose });

    // themeOverlay 변경 시 time → point lookup Map을 미리 구성 (hover 시 O(1) 조회)
    const overlayLookup = useMemo((): Map<string, Map<number, { valueKrx: number; valueNxt: number; amount: number; cumAmount: number }>> => {
        const outer = new Map<string, Map<number, { valueKrx: number; valueNxt: number; amount: number; cumAmount: number }>>();
        for (const s of themeOverlay ?? []) {
            const inner = new Map<number, { valueKrx: number; valueNxt: number; amount: number; cumAmount: number }>();
            for (const p of s.series) {
                inner.set(p.time, { valueKrx: p.valueKrx, valueNxt: p.valueNxt, amount: p.amount, cumAmount: p.cumAmount });
            }
            outer.set(s.stockCode, inner);
        }
        return outer;
    }, [themeOverlay]);

    const colorMap = useMemo(() => assignSeriesColors(themeOverlay ?? []), [themeOverlay]);

    const selfSeries = useMemo(() => (themeOverlay ?? []).find((s) => s.isSelf) ?? null, [themeOverlay]);

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

            const selfRow: OverlayTooltipRow = {
                stockCode: selfSeries?.stockCode ?? "",
                stockName: selfSeries?.stockName ?? "",
                color: OVERLAY_SELF_COLOR,
                isSelf: true,
                rate: data.close,
                amount: amountMapRef.current.get(t) ?? 0,
                cumAmount: cumAmountMapRef.current.get(t) ?? 0,
            };

            const useNxt = mode === "nxt";
            const peerRows: OverlayTooltipRow[] = [];
            for (const s of themeOverlay ?? []) {
                if (s.isSelf) continue;
                const pt = overlayLookup.get(s.stockCode)?.get(t);
                if (!pt) continue;
                peerRows.push({
                    stockCode: s.stockCode,
                    stockName: s.stockName,
                    color: colorMap.get(s.stockCode) ?? OVERLAY_PEER_PALETTE[0],
                    isSelf: false,
                    rate: useNxt ? pt.valueNxt : pt.valueKrx,
                    amount: pt.amount,
                    cumAmount: pt.cumAmount,
                });
            }
            peerRows.sort((a, b) => b.rate - a.rate);

            return <MinuteTooltip time={t} rows={[selfRow, ...peerRows]} />;
        },
        leftOffset: () => chartRef.current?.priceScale("left").width() ?? 0,
    });

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
        </div>
    );
}
