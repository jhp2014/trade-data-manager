"use client";

import { useEffect, useRef } from "react";
import { CrosshairMode, LineStyle, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartCandle } from "@/types/chart";
import { kstYmd } from "@/lib/chartTime";
import { HIGH_MARKER_MIN_PCT, AMOUNT_MIL_TO_EOK } from "@/lib/constants";
import { useUiStore } from "@/stores/useUiStore";
import { useChartShell } from "./shell/useChartShell";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { DailyTooltip } from "./tooltip/DailyTooltip";
import styles from "./RealDailyChart.module.css";

interface Props {
    candles: ChartCandle[];
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

export function RealDailyChart({ candles }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    const mode = useUiStore((s) => s.dailyChartPriceMode);
    const setMode = useUiStore((s) => s.setDailyChartPriceMode);

    const chartRef = useChartShell(containerRef, () => ({
        layout: { background: { color: "transparent" }, textColor: "#6b7280", fontSize: 11 },
        grid: {
            vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
            horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.5)", style: 0, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.5)", style: 0, labelVisible: true },
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
    const dataMapRef = useRef<Map<number, ChartCandle>>(new Map());
    const baseCandleRef = useRef<ChartCandle | null>(null);

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

            // hover 봉의 표시 가격(KRX or NXT high) 기준으로 두 prev close에 대한 % 산출
            const hoverHigh = useNxt ? (candle.highNxt ?? candle.high) : candle.high;
            const hoverHighKrxPct = candle.prevCloseKrx && candle.prevCloseKrx > 0
                ? ((hoverHigh - candle.prevCloseKrx) / candle.prevCloseKrx) * 100 : null;
            const hoverHighNxtPct = candle.prevCloseNxt && candle.prevCloseNxt > 0
                ? ((hoverHigh - candle.prevCloseNxt) / candle.prevCloseNxt) * 100 : null;

            const cursorKrxPct = cursorPrice != null && Number.isFinite(cursorPrice) && base?.prevCloseKrx
                ? ((cursorPrice - base.prevCloseKrx) / base.prevCloseKrx) * 100 : null;
            const cursorNxtPct = cursorPrice != null && Number.isFinite(cursorPrice) && base?.prevCloseNxt
                ? ((cursorPrice - base.prevCloseNxt) / base.prevCloseNxt) * 100 : null;
            const cursorAmountEok = candle.amount != null ? fmtEok(candle.amount / AMOUNT_MIL_TO_EOK) : null;

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
        const map = new Map<number, ChartCandle>();

        candleSeries.setData(candles.map((c) => {
            map.set(c.time, c);
            return {
                time: c.time as Time,
                open: useNxt ? (c.openNxt ?? c.open) : c.open,
                high: useNxt ? (c.highNxt ?? c.high) : c.high,
                low: useNxt ? (c.lowNxt ?? c.low) : c.low,
                close: useNxt ? (c.closeNxt ?? c.close) : c.close,
            };
        }));
        dataMapRef.current = map;
        baseCandleRef.current = candles.length > 0 ? candles[candles.length - 1] : null;

        amountSeries.setData(
            candles.filter((c) => {
                const amt = useNxt ? c.amountNxt : c.amount;
                return amt != null;
            }).map((c) => {
                const amt = useNxt ? (c.amountNxt as number) : (c.amount as number);
                const open = useNxt ? (c.openNxt ?? c.open) : c.open;
                const close = useNxt ? (c.closeNxt ?? c.close) : c.close;
                return {
                    time: c.time as Time,
                    value: amt / AMOUNT_MIL_TO_EOK,
                    color: close >= open ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
                };
            }),
        );

        // 고가 마커는 모드와 무관하게 항상 KRX 기준 (ADR-009)
        const markers: Array<{ time: Time; position: "aboveBar"; color: string; shape: "circle"; text: string }> = [];
        for (const c of candles) {
            if (!c.prevCloseKrx || c.prevCloseKrx <= 0) continue;
            const pct = ((c.high - c.prevCloseKrx) / c.prevCloseKrx) * 100;
            const color = highMarkerColor(pct);
            if (color) markers.push({ time: c.time as Time, position: "aboveBar", color, shape: "circle", text: `+${pct.toFixed(1)}` });
        }
        candleSeries.setMarkers(markers);
        chartRef.current?.timeScale().fitContent();
    }, [candles, mode]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div className={styles.modeToggle}>
                <button
                    type="button"
                    className={`${styles.modeBtn} ${mode === "krx" ? styles.modeBtnActive : ""}`}
                    onClick={() => setMode("krx")}
                >
                    KRX
                </button>
                <button
                    type="button"
                    className={`${styles.modeBtn} ${mode === "nxt" ? styles.modeBtnActive : ""}`}
                    onClick={() => setMode("nxt")}
                >
                    NXT
                </button>
            </div>
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
