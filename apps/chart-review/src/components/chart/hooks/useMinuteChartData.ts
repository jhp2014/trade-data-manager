import { useEffect, useRef } from "react";
import { type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import type { MinuteCandle } from "@/types/chart";
import type { ChartPriceMode } from "@/stores/useUiStore";
import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";

const AMOUNT_RISE_FILL = "rgba(239,68,68,0.5)";
const AMOUNT_FALL_FILL = "rgba(59,130,246,0.5)";

interface Params {
    chartRef: React.MutableRefObject<IChartApi | null>;
    candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    amountSeriesRef: React.MutableRefObject<ISeriesApi<"Histogram"> | null>;
    candles: MinuteCandle[];
    mode: ChartPriceMode;
}

/**
 * candles / mode 변경 시 분봉 시리즈에 데이터를 푸시한다.
 * 툴팁이 사용할 amountMap / cumAmountMap도 함께 갱신한다.
 */
export function useMinuteChartData({
    chartRef,
    candleSeriesRef,
    amountSeriesRef,
    candles,
    mode,
}: Params) {
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const cumAmountMapRef = useRef<Map<number, number>>(new Map());

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
                    color: ohlc.close >= ohlc.open ? AMOUNT_RISE_FILL : AMOUNT_FALL_FILL,
                });
            }
        }
        amountMapRef.current = amountMap;
        cumAmountMapRef.current = cumMap;
        amountSeries.setData(amountData);
        // 전체 봉 + 좌측 5% 여백(좌측 스케일과 첫 캔들 사이 공간) + 우측 2봉.
        const ts = chartRef.current?.timeScale();
        if (ts && candles.length > 0) {
            const leftGap = Math.max(1, Math.round(candles.length * 0.05));
            ts.setVisibleLogicalRange({ from: -leftGap, to: candles.length - 1 + 2 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, mode]);

    return { amountMapRef, cumAmountMapRef };
}
