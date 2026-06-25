"use client";

import { useEffect, useRef } from "react";
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    CrosshairMode,
    LineStyle,
    createSeriesMarkers,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type IPriceLine,
    type Time,
} from "lightweight-charts";
import type { DailyCandle } from "@/lib/chartTypes";
import type { LineSpec } from "@/types/capture";
import {
    kstYmd,
    highMarkerColor,
    RISE_COLOR,
    FALL_COLOR,
    RISE_FILL,
    FALL_FILL,
    AMOUNT_BAR_COLOR,
} from "@trade-data-manager/chart-utils";
import { computePriceLineChartValue, buildPriceLineOptions } from "@/lib/chart/priceLines";

interface Props {
    candles: DailyCandle[];
    variant: "KRX" | "NXT";
    priceLines: LineSpec[];
    onReady: () => void;
}

const AMOUNT_MIL_TO_EOK = 100;

export function DailyChart({ candles, variant, priceLines, onReady }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const priceLineHandlesRef = useRef<IPriceLine[]>([]);
    const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const onReadyCalled = useRef(false);

    // 차트 인스턴스 생성 (마운트 1회)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            width: container.clientWidth || 800,
            height: container.clientHeight || 400,
            layout: {
                background: { color: "#ffffff" }, textColor: "#6b7280", fontSize: 11,
                panes: { separatorColor: "rgba(0,0,0,0.12)", separatorHoverColor: "rgba(0,0,0,0.2)", enableResize: false },
            },
            grid: {
                vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
                horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
            },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.08 } },
            leftPriceScale: { visible: false },
            timeScale: {
                borderVisible: false,
                barSpacing: 3,
                rightOffset: 4,
                tickMarkFormatter: (t: number) => kstYmd(t).slice(5),
            },
            handleScroll: false,
            handleScale: false,
            localization: { locale: "ko-KR", timeFormatter: (t: number) => kstYmd(t) },
        });
        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: RISE_COLOR, downColor: FALL_COLOR,
            borderUpColor: RISE_COLOR, borderDownColor: FALL_COLOR,
            wickUpColor: RISE_COLOR, wickDownColor: FALL_COLOR,
            priceScaleId: "right", priceLineVisible: false, lastValueVisible: false,
            priceFormat: { type: "price", precision: 0, minMove: 1 },
        });
        // 거래대금은 별도 pane(1)으로 분리해 캔들과 스케일이 섞이지 않게 한다.
        const amountSeries = chart.addSeries(HistogramSeries, {
            priceScaleId: "right",
            priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}억`, minMove: 0.1 },
            color: AMOUNT_BAR_COLOR,
        }, 1);
        chart.priceScale("right", 1).applyOptions({ borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } });

        // 캔들 pane : 거래대금 pane = 3 : 1
        const panes = chart.panes();
        panes[0].setStretchFactor(3);
        panes[1].setStretchFactor(1);

        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;
        markersApiRef.current = createSeriesMarkers(candleSeries);

        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        });
        ro.observe(container);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
            markersApiRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 데이터 세팅 + onReady 호출
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        const amountSeries = amountSeriesRef.current;
        if (!candleSeries || !amountSeries) return;

        const useNxt = variant === "NXT";

        candleSeries.setData(candles.map((c) => {
            const ohlc = useNxt ? c.nxt : c.krx;
            return { time: c.time as Time, ...ohlc };
        }));

        amountSeries.setData(
            candles
                .filter((c) => {
                    const amt = useNxt ? c.amountNxt : c.amountKrx;
                    return amt != null;
                })
                .map((c) => {
                    const amt = (useNxt ? c.amountNxt : c.amountKrx) as number;
                    const ohlc = useNxt ? c.nxt : c.krx;
                    return {
                        time: c.time as Time,
                        value: amt / AMOUNT_MIL_TO_EOK,
                        color: ohlc.close >= ohlc.open ? RISE_FILL : FALL_FILL,
                    };
                }),
        );

        const markers: Array<{ time: Time; position: "aboveBar"; color: string; shape: "circle"; text: string }> = [];
        for (const c of candles) {
            const prevClose = useNxt ? c.prevCloseNxt : c.prevCloseKrx;
            if (prevClose == null || prevClose <= 0) continue;
            const high = useNxt ? c.nxt.high : c.krx.high;
            const pct = ((high - prevClose) / prevClose) * 100;
            const color = highMarkerColor(pct);
            if (color) {
                markers.push({
                    time: c.time as Time,
                    position: "aboveBar",
                    color,
                    shape: "circle",
                    text: `+${pct.toFixed(1)}`,
                });
            }
        }
        markersApiRef.current?.setMarkers(markers);

        chartRef.current?.timeScale().fitContent();

        if (!onReadyCalled.current) {
            onReadyCalled.current = true;
            requestAnimationFrame(() => onReady());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, variant]);

    // 가격 라인 (일봉: 가격 그대로)
    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        for (const line of priceLineHandlesRef.current) {
            try { candleSeries.removePriceLine(line); } catch { /* noop */ }
        }
        priceLineHandlesRef.current = [];

        for (const spec of priceLines) {
            for (const price of spec.values) {
                const chartValue = computePriceLineChartValue(price, null, true);
                if (chartValue === null) continue;
                try {
                    const handle = candleSeries.createPriceLine(
                        buildPriceLineOptions(spec.color, "", chartValue),
                    );
                    priceLineHandlesRef.current.push(handle);
                } catch { /* noop */ }
            }
        }
    }, [priceLines]);

    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
