import { useEffect, useRef } from "react";
import { CandlestickSeries, HistogramSeries, LineStyle, createSeriesMarkers, type AutoscaleInfo, type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type Time } from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR, AMOUNT_BAR_COLOR } from "@/lib/colors";
import { configureAmountPane } from "@/lib/chart/panes";

/**
 * 분봉 차트의 candlestick + amount(histogram) 시리즈를 마운트 시 1회 생성한다.
 * 이후 다른 hook에서 ref를 통해 데이터/마커/가격라인을 갱신한다.
 *
 * 마커 플러그인(v5)도 캔들 시리즈와 같은 생명주기로 여기서 함께 생성·폐기한다.
 * 핸들이 죽은 시리즈를 가리키는 상태가 구조적으로 생기지 않도록, 시리즈와 한 몸으로 묶는다.
 */
export function useMinuteChartSeries(chartRef: React.MutableRefObject<IChartApi | null>) {
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const candleMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        const candleSeries = chart.addSeries(CandlestickSeries, {
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

        // 거래대금은 별도 pane(1)으로 분리해 캔들과 스케일이 섞이지 않게 한다.
        const amountSeries = chart.addSeries(HistogramSeries, {
            priceScaleId: "right",
            priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}억`, minMove: 1 },
            priceLineVisible: false, lastValueVisible: false,
            color: AMOUNT_BAR_COLOR,
        }, 1);
        configureAmountPane(chart);

        candleSeriesRef.current = candleSeries;
        amountSeriesRef.current = amountSeries;
        candleMarkersRef.current = createSeriesMarkers(candleSeries);

        return () => {
            candleSeriesRef.current = null;
            amountSeriesRef.current = null;
            candleMarkersRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleSeriesRef, amountSeriesRef, candleMarkersRef };
}
