"use client";

import { useEffect, useRef } from "react";
import {
    createChart,
    CrosshairMode,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from "lightweight-charts";
import type { ChartCandle } from "@/actions/chartPreview";
import { kstYmd } from "@/lib/chartTime";


interface Props {
    candles: ChartCandle[];
    height?: number;
}

const HOVER_DELAY_MS = 200;

export function RealDailyChart({ candles, height = 680 }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    // time(unix sec) -> candle 매핑
    const dataMapRef = useRef<Map<number, ChartCandle>>(new Map());
    // 200ms 지연 타이머
    const hoverTimerRef = useRef<number | null>(null);
    // 마지막 호버 정보 (지연 후 사용)
    const pendingRef = useRef<{
        x: number;
        y: number;
        time: number;
    } | null>(null);

    // 차트 생성 (마운트 시 1회)
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
                vertLine: {
                    width: 1,
                    color: "rgba(150,150,150,0.5)",
                    style: 0,
                    labelVisible: true,
                },
                horzLine: {
                    width: 1,
                    color: "rgba(150,150,150,0.5)",
                    style: 0,
                    labelVisible: true,
                },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.05, bottom: 0.10 },
            },
            timeScale: {
                borderVisible: false,
                barSpacing: 3,
                rightOffset: 4,
                tickMarkFormatter: (t: number) => kstYmd(t).slice(5), // MM-DD
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
                timeFormatter: (t: number) => kstYmd(t),
            },
        });

        const series = chart.addCandlestickSeries({
            upColor: "#ef4444",
            downColor: "#3b82f6",
            borderUpColor: "#ef4444",
            borderDownColor: "#3b82f6",
            wickUpColor: "#ef4444",
            wickDownColor: "#3b82f6",
        });

        chartRef.current = chart;
        seriesRef.current = series;

        // resize
        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({ width: containerRef.current.clientWidth });
            }
        });
        ro.observe(container);

        // 호버 추적 (200ms debounce)
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
                if (hoverTimerRef.current !== null) {
                    window.clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                pendingRef.current = null;
                tip.style.display = "none";
                return;
            }

            pendingRef.current = {
                x: param.point.x,
                y: param.point.y,
                time: param.time as number,
            };

            // 이미 보이는 동안엔 즉시 갱신, 처음 진입 시만 200ms 대기
            if (tip.style.display === "block") {
                renderTooltip();
                return;
            }
            if (hoverTimerRef.current !== null) return;
            hoverTimerRef.current = window.setTimeout(() => {
                hoverTimerRef.current = null;
                renderTooltip();
            }, HOVER_DELAY_MS);
        });

        function renderTooltip() {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            const series = seriesRef.current;
            const p = pendingRef.current;
            if (!tip || !c || !series || !p) return;

            const candle = dataMapRef.current.get(p.time);
            if (!candle) {
                tip.style.display = "none";
                return;
            }

            // 십자선 y좌표 → 절대가로 환산 (그 봉의 차트 가격 스케일 기준)
            const cursorPrice = series.coordinateToPrice(p.y);
            if (cursorPrice === null || !Number.isFinite(cursorPrice)) {
                tip.style.display = "none";
                return;
            }

            const krxPct =
                candle.prevCloseKrx && candle.prevCloseKrx > 0
                    ? ((cursorPrice - candle.prevCloseKrx) / candle.prevCloseKrx) * 100
                    : null;
            const nxtPct =
                candle.prevCloseNxt && candle.prevCloseNxt > 0
                    ? ((cursorPrice - candle.prevCloseNxt) / candle.prevCloseNxt) * 100
                    : null;

            const fmtPct = (v: number | null) =>
                v === null
                    ? "—"
                    : `<span style="color:${v >= 0 ? "#ef4444" : "#3b82f6"
                    }">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</span>`;

            tip.innerHTML = `
                <div style="font-size:11px;color:#a0a0a0;margin-bottom:6px">${kstYmd(p.time)}</div>
                <div style="display:grid;grid-template-columns:auto auto;gap:4px 12px;font-size:12px">
                <div style="color:#a0a0a0">커서 가격</div>
                <div style="text-align:right;font-variant-numeric:tabular-nums">${Math.round(cursorPrice).toLocaleString()}</div>
                <div style="color:#a0a0a0">KRX %</div>
                <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(krxPct)}</div>
                <div style="color:#a0a0a0">NXT %</div>
                <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(nxtPct)}</div>
                </div>
            `;
            tip.style.display = "block";

            // 위치: 마우스 근처, 가장자리 회피
            const TW = tip.offsetWidth || 180;
            const TH = tip.offsetHeight || 90;
            const M = 12;
            let left = p.x + M;
            if (left + TW > c.clientWidth) left = p.x - M - TW;
            if (left < 0) left = M;
            let top = p.y + M;
            if (top + TH > c.clientHeight) top = p.y - M - TH;
            if (top < 0) top = M;
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
        }


        return () => {
            if (hoverTimerRef.current !== null) {
                window.clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
            }
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [height]);

    // 데이터 갱신
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;

        const map = new Map<number, ChartCandle>();
        const data = candles.map((c) => {
            map.set(c.time, c);
            return {
                time: c.time as Time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
            };
        });
        dataMapRef.current = map;
        series.setData(data);
        chartRef.current?.timeScale().fitContent();
    }, [candles]);

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
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    color: "#fff",
                    zIndex: 10,
                    fontFamily: "inherit",
                    minWidth: 160,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                }}
            />
        </div>
    );
}
