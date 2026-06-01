import { useEffect, useRef } from "react";
import type { IPriceLine, ISeriesApi } from "lightweight-charts";
import { buildPriceLineOptions, computePriceLineChartValue } from "@/lib/chart/priceLines";

interface Params {
    candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    priceLines?: Record<string, number[]>;
    /** 분봉 차트는 prevClose 기준 %로 변환. null이면 라인을 그리지 않음. */
    prevClose: number | null;
}

/**
 * 분봉 시리즈에 prevClose 기준 % 가격 라인을 부착한다.
 * 변경 시 기존 라인을 제거 후 새로 만든다.
 */
export function useMinuteChartPriceLines({ candleSeriesRef, priceLines, prevClose }: Params) {
    const handlesRef = useRef<IPriceLine[]>([]);

    useEffect(() => {
        const candleSeries = candleSeriesRef.current;
        if (!candleSeries) return;

        for (const line of handlesRef.current) {
            try { candleSeries.removePriceLine(line); } catch { /* noop */ }
        }
        handlesRef.current = [];

        if (!priceLines || prevClose == null || prevClose <= 0) return;
        for (const [key, prices] of Object.entries(priceLines)) {
            if (!prices || prices.length === 0) continue;
            for (const price of prices) {
                const chartValue = computePriceLineChartValue(price, prevClose, false);
                if (chartValue === null) continue;
                try {
                    const handle = candleSeries.createPriceLine(buildPriceLineOptions(key, price, chartValue, false));
                    handlesRef.current.push(handle);
                } catch { /* noop */ }
            }
        }
        // priceLines는 객체 참조 동일성이 보장되지 않으므로 JSON 직렬화로 비교
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(priceLines), prevClose]);
}
