"use client";

import { useEffect, useRef } from "react";
import { CrosshairMode, LineStyle, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartCandle } from "@/actions/chartPreview";
import { kstYmd } from "@/lib/chartTime";
import { CHART_HOVER_DELAY_MS, HIGH_MARKER_MIN_PCT, AMOUNT_MIL_TO_EOK } from "@/lib/constants";
import { useChartShell } from "./shell/useChartShell";
import { positionTooltip, TOOLTIP_STYLE } from "./shell/tooltipUtils";

interface Props {
    candles: ChartCandle[];
}

function fmtEok(v: number) {
    if (v >= 10000) return `${(v / 10000).toFixed(2)}조`;
    if (v >= 1) return `${v.toFixed(1)}억`;
    if (v >= 0.0001) return `${(v * 10000).toFixed(0)}만`;
    return v.toLocaleString();
}

// 전일 KRX 종가 대비 고가 % 에 따라 봉 위 마커 색상 결정
function highMarkerColor(pct: number): string | null {
    if (pct < HIGH_MARKER_MIN_PCT) return null;
    if (pct < 15) return "#fbbf24";
    if (pct < 20) return "#fb923c";
    if (pct < 25) return "#ef4444";
    if (pct < 30) return "#a855f7";
    return "#7c3aed";
}

const fmtPct = (v: number | null) =>
    v === null
        ? "—"
        : `<span style="color:${v >= 0 ? "#ef4444" : "#3b82f6"}">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</span>`;

export function RealDailyChart({ candles }: Props) {
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
            vertLine: { width: 1, color: "rgba(150,150,150,0.5)", style: 0, labelVisible: true },
            horzLine: { width: 1, color: "rgba(150,150,150,0.5)", style: 0, labelVisible: true },
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
    const hoverTimerRef = useRef<number | null>(null);
    const pendingRef = useRef<{ x: number; y: number; time: number } | null>(null);

    // 시리즈 생성 + 툴팁 구독 (마운트 1회)
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

        chart.subscribeCrosshairMove((param) => {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            if (!tip || !c) return;

            if (!param.point || !param.time ||
                param.point.x < 0 || param.point.x > c.clientWidth ||
                param.point.y < 0 || param.point.y > c.clientHeight) {
                if (hoverTimerRef.current !== null) {
                    window.clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                pendingRef.current = null;
                tip.style.display = "none";
                return;
            }

            pendingRef.current = { x: param.point.x, y: param.point.y, time: param.time as number };
            if (tip.style.display === "block") { renderTooltip(); return; }
            if (hoverTimerRef.current !== null) return;
            hoverTimerRef.current = window.setTimeout(() => {
                hoverTimerRef.current = null;
                renderTooltip();
            }, CHART_HOVER_DELAY_MS);
        });

        function renderTooltip() {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            const p = pendingRef.current;
            if (!tip || !c || !p) return;

            const candle = dataMapRef.current.get(p.time);
            if (!candle) { tip.style.display = "none"; return; }

            const cursorPrice = candleSeries.coordinateToPrice(p.y);
            const base = baseCandleRef.current;
            const hoverHighKrxPct = candle.prevCloseKrx && candle.prevCloseKrx > 0
                ? ((candle.high - candle.prevCloseKrx) / candle.prevCloseKrx) * 100 : null;
            const hoverHighNxtPct = candle.prevCloseNxt && candle.prevCloseNxt > 0
                ? ((candle.high - candle.prevCloseNxt) / candle.prevCloseNxt) * 100 : null;
            const cursorKrxPct = cursorPrice != null && Number.isFinite(cursorPrice) && base?.prevCloseKrx
                ? ((cursorPrice - base.prevCloseKrx) / base.prevCloseKrx) * 100 : null;
            const cursorNxtPct = cursorPrice != null && Number.isFinite(cursorPrice) && base?.prevCloseNxt
                ? ((cursorPrice - base.prevCloseNxt) / base.prevCloseNxt) * 100 : null;

            const amt = candle.amount != null ? fmtEok(candle.amount / AMOUNT_MIL_TO_EOK) : "—";
            tip.innerHTML = `
                <div style="font-size:11px;color:#a0a0a0;margin-bottom:6px">${kstYmd(p.time)}</div>
                <div style="display:grid;grid-template-columns:auto auto;gap:4px 14px;font-size:12px">
                  <div style="color:#a0a0a0">Today KRX %</div><div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(cursorKrxPct)}</div>
                  <div style="color:#a0a0a0">Today NXT %</div><div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(cursorNxtPct)}</div>
                  <div style="color:#a0a0a0">Cursor Candle KRX %</div><div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(hoverHighKrxPct)}</div>
                  <div style="color:#a0a0a0">Cursor Candle NXT %</div><div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(hoverHighNxtPct)}</div>
                  <div style="color:#a0a0a0">Cursor Candle Amount</div><div style="text-align:right;font-variant-numeric:tabular-nums">${amt}</div>
                </div>`;
            tip.style.display = "block";

            const leftW = chart?.priceScale("left").width() ?? 0;
            positionTooltip(tip, c, p.x + leftW, p.y);
        }

        return () => {
            if (hoverTimerRef.current !== null) {
                window.clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
            }
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

        const map = new Map<number, ChartCandle>();
        candleSeries.setData(candles.map((c) => {
            map.set(c.time, c);
            return { time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close };
        }));
        dataMapRef.current = map;
        baseCandleRef.current = candles.length > 0 ? candles[candles.length - 1] : null;

        amountSeries.setData(
            candles.filter((c) => c.amount != null).map((c) => ({
                time: c.time as Time,
                value: (c.amount as number) / AMOUNT_MIL_TO_EOK,
                color: c.close >= c.open ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
            })),
        );

        const markers: Array<{ time: Time; position: "aboveBar"; color: string; shape: "circle"; text: string }> = [];
        for (const c of candles) {
            if (!c.prevCloseKrx || c.prevCloseKrx <= 0) continue;
            const pct = ((c.high - c.prevCloseKrx) / c.prevCloseKrx) * 100;
            const color = highMarkerColor(pct);
            if (color) markers.push({ time: c.time as Time, position: "aboveBar", color, shape: "circle", text: `+${pct.toFixed(1)}` });
        }
        candleSeries.setMarkers(markers);
        chartRef.current?.timeScale().fitContent();
    }, [candles]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div ref={tooltipRef} style={{ ...TOOLTIP_STYLE, minWidth: 220 }} />
        </div>
    );
}
