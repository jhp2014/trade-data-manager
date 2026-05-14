"use client";

import { useEffect, useMemo, useRef } from "react";
import { CrosshairMode, LineStyle, type IPriceLine, type ISeriesApi, type Time } from "lightweight-charts";
import type { MinuteCandle, ChartOverlaySeries } from "@/types/chart";
import { kstHHmm } from "@/lib/chartTime";
import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";
import { useUiStore } from "@/stores/useUiStore";
import { useChartShell } from "./shell/useChartShell";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { MinuteTooltip } from "./tooltip/MinuteTooltip";
import type { OverlayTooltipRow } from "./tooltip/ThemeRowList";
import { SELF_COLOR, PALETTE, assignSeriesColors } from "@/lib/chart/overlay";
import { buildPriceLineOptions, computePriceLineChartValue } from "@/lib/chart/priceLines";
import { amountMarkerFor } from "@/lib/chart/amountMarker";

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

    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const cumAmountMapRef = useRef<Map<number, number>>(new Map());
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const priceLineHandlesRef = useRef<IPriceLine[]>([]);

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

            // peers 행 (themeOverlay의 non-self 시리즈에서 lookup, 모드별 분기)
            const useNxt = mode === "nxt";
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

    // 데이터 갱신 (mode 전환 시에도 재실행)
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        const useNxt = mode === "nxt";

        candleSeries.setData(candles.map((c) => {
            const ohlc = useNxt ? c.nxt : c.krx;
            return { time: c.time as Time, open: ohlc.open, high: ohlc.high, low: ohlc.low, close: ohlc.close };
        }));

        const amountMap = new Map<number, number>();
        const cumMap = new Map<number, number>();
        const amountData: Array<{ time: Time; value: number; color: string }> = [];
        for (const c of candles) {
            const a = c.amount ?? 0;
            amountMap.set(c.time, a);
            cumMap.set(c.time, c.accAmount ?? 0);
            if (c.amount != null && a > 0) {
                const ohlc = useNxt ? c.nxt : c.krx;
                amountData.push({
                    time: c.time as Time,
                    value: a / AMOUNT_KRW_TO_EOK,
                    color: ohlc.close >= ohlc.open ? "rgba(239,68,68,0.5)" : "rgba(59,130,246,0.5)",
                });
            }
        }
        amountMapRef.current = amountMap;
        cumAmountMapRef.current = cumMap;
        amountSeries.setData(amountData);
        chartRef.current?.timeScale().fitContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, mode]);

    // 마커 통합: 거래대금 임계 마커 + 진입 마커 (Point)
    // lightweight-charts 제약:
    //   1) 마커 배열은 time 오름차순으로 정렬되어야 함
    //   2) 같은 time에 여러 마커 금지 → Map으로 중복 제거
    //      (같은 봉이면 진입 마커 우선)
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series) return;

        type MarkerEntry = {
            time: Time;
            position: "aboveBar" | "belowBar";
            color: string;
            shape: "arrowDown" | "circle" | "square";
            text: string;
            size?: number;
        };

        const byTime = new Map<number, MarkerEntry>();

        // 1) 거래대금 임계 마커 (작은 사각형, 캔들 위)
        for (const c of candles) {
            const info = amountMarkerFor(c.amount);
            if (!info) continue;
            byTime.set(c.time, {
                time: c.time as Time,
                position: "aboveBar",
                color: info.color,
                shape: "square",
                text: info.text,
                size: 0,
            });
        }

        // 2) 진입 마커는 거래대금 마커를 덮어씀 (같은 봉이면 진입 마커가 우선)
        if (markerTime != null) {
            byTime.set(markerTime, {
                time: markerTime as Time,
                position: "aboveBar",
                color: "#000000ff",
                shape: "arrowDown",
                text: "Point",
            });
        }

        // 3) time 오름차순 정렬 후 setMarkers
        const markers = Array.from(byTime.values()).sort(
            (a, b) => (a.time as number) - (b.time as number),
        );

        series.setMarkers(markers);
    }, [markerTime, candles]);


    // 가격 라인 (분봉: prevClose 기준 % 변환, candleSeries에 직접 부착)
    const prevClose = mode === "nxt" ? (prevCloseNxt ?? null) : (prevCloseKrx ?? null);
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        for (const line of priceLineHandlesRef.current) {
            try { candleSeries.removePriceLine(line); } catch { /* noop */ }
        }
        priceLineHandlesRef.current = [];

        if (!priceLines || prevClose == null || prevClose <= 0) return;
        for (const [key, prices] of Object.entries(priceLines)) {
            if (!prices || prices.length === 0) continue;
            for (const price of prices) {
                const chartValue = computePriceLineChartValue(price, prevClose, false);
                if (chartValue === null) continue;
                try {
                    const handle = candleSeries.createPriceLine(buildPriceLineOptions(key, price, chartValue, false));
                    priceLineHandlesRef.current.push(handle);
                } catch { /* noop */ }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(priceLines), prevClose]);

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
