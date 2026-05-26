import { LineStyle } from "lightweight-charts";
import type { CreatePriceLineOptions } from "lightweight-charts";
import { PRICE_LINE_PALETTE } from "@/lib/colors";

function hashKey(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
        h = (h * 31 + key.charCodeAt(i)) >>> 0;
    }
    return h;
}

export function colorForPriceLineKey(key: string): string {
    return PRICE_LINE_PALETTE[hashKey(key) % PRICE_LINE_PALETTE.length];
}

export function stripLinePrefix(key: string): string {
    return key.startsWith("line_") ? key.slice(5) : key;
}

/** Returns null if the value cannot be shown (no prevClose, non-finite, etc.) */
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
    key: string,
    price: number,
    chartValue: number,
    asPrice: boolean,
): CreatePriceLineOptions {
    const label = stripLinePrefix(key);
    const title = asPrice
        ? ``
        : `${label} %`;
    return {
        price: chartValue,
        color: colorForPriceLineKey(key),
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: title,
    };
}
