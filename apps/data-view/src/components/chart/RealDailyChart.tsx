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
}

const HOVER_DELAY_MS = 200;

// DB 거래대금은 "백만" 단위 (1 = 1,000,000원). 화면엔 "억" 단위로 변환.
const fmtAmount = (v: number) => {
    const eok = v / 100; // 백만 → 억
    if (eok >= 10000) return `${(eok / 10000).toFixed(2)}조`;
    if (eok >= 1) return `${eok.toFixed(1)}억`;
    if (eok >= 0.0001) return `${(eok * 10000).toFixed(0)}만`;
    return v.toLocaleString(); // 그 미만은 백만 단위 그대로
};

// 전일 KRX 종가 대비 고가 % 에 따라 색상 결정. null = 마커 없음
function highMarkerColor(pct: number | null): string | null {
    if (pct === null || pct < 10) return null;
    if (pct < 15) return "#fbbf24"; // 노랑
    if (pct < 20) return "#fb923c"; // 주황
    if (pct < 25) return "#ef4444"; // 빨강
    if (pct < 30) return "#a855f7"; // 자주
    return "#7c3aed"; // 진한 자주
}

export function RealDailyChart({ candles }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    // time -> candle 매핑 (모달에서 봉 정보 lookup)
    const dataMapRef = useRef<Map<number, ChartCandle>>(new Map());
    // 기준일 (가장 우측 봉) candle — KRX/NXT % 의 기준
    const baseCandleRef = useRef<ChartCandle | null>(null);
    // 200ms 지연 타이머
    const hoverTimerRef = useRef<number | null>(null);
    const pendingRef = useRef<{ x: number; y: number; time: number } | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const initialWidth = container.clientWidth || 800;
        const initialHeight = container.clientHeight || 600;

        const chart = createChart(container, {
            width: initialWidth,
            height: initialHeight,
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
                visible: true,
                borderVisible: false,
                scaleMargins: { top: 0.05, bottom: 0.30 },
            },
            leftPriceScale: {
                visible: false,
                borderVisible: false,
                scaleMargins: { top: 0.75, bottom: 0 },
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

        const candleSeries = chart.addCandlestickSeries({
            upColor: "#ef4444",
            downColor: "#3b82f6",
            borderUpColor: "#ef4444",
            borderDownColor: "#3b82f6",
            wickUpColor: "#ef4444",
            wickDownColor: "#3b82f6",
            priceScaleId: "right",
            priceLineVisible: false,        // ← 추가 (마지막 종가 점선 제거)
            lastValueVisible: false,        // ← 좌측 등 잔여 라벨 제거
            priceFormat: {
                type: "price",
                precision: 0,
                minMove: 1,
            },
        });

        // 거래대금 히스토그램 — 별도 priceScale "amount" (좌측 스케일 표시 X)
        const amountSeries = chart.addHistogramSeries({
            priceScaleId: "amount",
            priceFormat: {
                type: "custom",
                formatter: (v: number) => `${v.toFixed(1)}억`,
                minMove: 0.1,
            },
            color: "rgba(120,120,140,0.5)",
        });
        chart.priceScale("amount").applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;


        // ResizeObserver: width/height 둘 다 추적
        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
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
            const candleSeries = candleSeriesRef.current;
            const p = pendingRef.current;
            if (!tip || !c || !candleSeries || !p) return;

            const candle = dataMapRef.current.get(p.time);
            if (!candle) {
                tip.style.display = "none";
                return;
            }

            // 십자선 y → 가격 (커서 가격)
            const cursorPrice = candleSeries.coordinateToPrice(p.y);

            // 호버 봉의 고가 % (해당 봉 자신의 prevClose 기준)
            const hoverHighKrxPct =
                candle.prevCloseKrx && candle.prevCloseKrx > 0
                    ? ((candle.high - candle.prevCloseKrx) / candle.prevCloseKrx) * 100
                    : null;
            const hoverHighNxtPct =
                candle.prevCloseNxt && candle.prevCloseNxt > 0
                    ? ((candle.high - candle.prevCloseNxt) / candle.prevCloseNxt) * 100
                    : null;

            // 커서 위치의 가격을 기준 봉의 prevClose 기준 % 로
            const cursorKrxPct =
                cursorPrice !== null &&
                    Number.isFinite(cursorPrice) &&
                    baseCandleRef.current!.prevCloseKrx &&
                    baseCandleRef.current!.prevCloseKrx > 0
                    ? ((cursorPrice - baseCandleRef.current!.prevCloseKrx) / baseCandleRef.current!.prevCloseKrx) * 100
                    : null;
            const cursorNxtPct =
                cursorPrice !== null &&
                    Number.isFinite(cursorPrice) &&
                    baseCandleRef.current!.prevCloseNxt &&
                    baseCandleRef.current!.prevCloseNxt > 0
                    ? ((cursorPrice - baseCandleRef.current!.prevCloseNxt) / baseCandleRef.current!.prevCloseNxt) * 100
                    : null;

            const fmtPct = (v: number | null) =>
                v === null
                    ? "—"
                    : `<span style="color:${v >= 0 ? "#ef4444" : "#3b82f6"
                    }">${v >= 0 ? "+" : ""}${v.toFixed(2)}%</span>`;

            tip.innerHTML = `
                <div style="font-size:11px;color:#a0a0a0;margin-bottom:6px">
                  ${kstYmd(p.time)}
                </div>
                <div style="display:grid;grid-template-columns:auto auto;gap:4px 14px;font-size:12px">
                  <div style="color:#a0a0a0">Today KRX %</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(cursorKrxPct)}</div>
                  <div style="color:#a0a0a0">Today NXT %</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(cursorNxtPct)}</div>

                  <div style="color:#a0a0a0">Cursor Candle KRX %</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(hoverHighKrxPct)}</div>
                  <div style="color:#a0a0a0">Cursor Candle NXT %</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${fmtPct(hoverHighNxtPct)}</div>

                  <div style="color:#a0a0a0">Cursor Candle Amount</div>
                  <div style="text-align:right;font-variant-numeric:tabular-nums">${candle.amount != null ? fmtAmount(candle.amount) : "—"}</div>
                </div>
            `;
            tip.style.display = "block";

            // 마우스 우하단에 위치 (좌측 priceScale 너비 보정)
            const chart = chartRef.current;
            const leftScaleWidth = chart ? chart.priceScale("left").width() : 0;
            const ax = p.x + leftScaleWidth;
            const ay = p.y;

            const TW = tip.offsetWidth || 220;
            const TH = tip.offsetHeight || 200;
            const M = 16;
            let left = ax + M;
            let top = ay + M;
            if (left + TW > c.clientWidth) left = ax - M - TW;
            if (left < 0) left = M;
            if (top + TH > c.clientHeight) top = ay - M - TH;
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
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
        };
    }, []);

    // 데이터 갱신
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        const map = new Map<number, ChartCandle>();
        const candleData = candles.map((c) => {
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
        // 기준일 = 가장 우측 (마지막) 봉
        baseCandleRef.current = candles.length > 0 ? candles[candles.length - 1] : null;

        candleSeries.setData(candleData);

        // 거래대금 데이터 (DB는 백만 단위 → 억 단위로: / 100)
        const amountData = candles
            .filter((c) => c.amount != null)
            .map((c) => ({
                time: c.time as Time,
                value: (c.amount as number) / 100,  // 백만 → 억
                color:
                    c.close >= c.open
                        ? "rgba(239,68,68,0.5)"
                        : "rgba(59,130,246,0.5)",
            }));
        amountSeries.setData(amountData);

        // 봉 위 고가 마커 (전일 KRX 종가 대비 고가 % 10% 이상만)
        const markers: Array<{
            time: Time;
            position: "aboveBar";
            color: string;
            shape: "circle";
            text: string;
        }> = [];
        for (const c of candles) {
            if (!c.prevCloseKrx || c.prevCloseKrx <= 0) continue;
            const highPct = ((c.high - c.prevCloseKrx) / c.prevCloseKrx) * 100;
            const color = highMarkerColor(highPct);
            if (color === null) continue;
            markers.push({
                time: c.time as Time,
                position: "aboveBar",
                color,
                shape: "circle",
                text: `+${highPct.toFixed(1)}`,
            });
        }
        candleSeries.setMarkers(markers);

        chartRef.current?.timeScale().fitContent();
    }, [candles]);

    return (
        <div
            ref={containerRef}
            style={{ position: "relative", width: "100%", height: "100%" }}
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
                    minWidth: 220,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}
            />
        </div>
    );
}
