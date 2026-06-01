import { useEffect, useRef } from "react";
import { LineStyle, type AutoscaleInfo, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR } from "@/lib/colors";

/**
 * 분봉 차트의 candlestick + amount(histogram) 시리즈를 마운트 시 1회 생성한다.
 * 이후 다른 hook에서 ref를 통해 데이터/마커/가격라인을 갱신한다.
 */
export function useMinuteChartSeries(chartRef: React.MutableRefObject<IChartApi | null>) {
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        const candleSeries = chart.addCandlestickSeries({
            upColor: RISE_COLOR, downColor: FALL_COLOR,
            borderUpColor: RISE_COLOR, borderDownColor: FALL_COLOR,
            wickUpColor: RISE_COLOR, wickDownColor: FALL_COLOR,
            priceScaleId: "right", priceLineVisible: false,
            priceFormat: { type: "custom", formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`, minMove: 0.01 },
            // 기본 0~25% 고정, 데이터가 범위를 넘으면 그에 맞춰 확장.
            autoscaleInfoProvider: (baseImpl: () => AutoscaleInfo | null) => {
                const base = baseImpl();
                const dataMin = base?.priceRange?.minValue ?? 0;
                const dataMax = base?.priceRange?.maxValue ?? 0;
                return {
                    priceRange: {
                        minValue: Math.min(0, dataMin),
                        maxValue: Math.max(25, dataMax),
                    },
                    margins: base?.margins,
                };
            },
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

    return { candleSeriesRef, amountSeriesRef };
}
