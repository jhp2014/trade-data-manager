import { LineStyle } from "lightweight-charts";
import type { CreatePriceLineOptions } from "lightweight-charts";

export function computePriceLineChartValue(
    price: number,
    prevClose: number | null,
    asPrice: boolean,
): number | null {
    if (asPrice) return Number.isFinite(price) ? price : null;
    if (prevClose == null || prevClose <= 0) return null;
    const pct = ((price - prevClose) / prevClose) * 100;
    return Number.isFinite(pct) ? pct : null;
}

export function buildPriceLineOptions(
    color: string,
    label: string,
    chartValue: number,
): CreatePriceLineOptions {
    return {
        price: chartValue,
        color,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: label,
    };
}
