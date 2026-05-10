import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import type { IndicatorHandle } from "./types";

export interface PriceLineListParams {
    /** key = "line_target" 같은 컬럼명, value = 가격 배열 */
    priceLines: Record<string, number[]>;
    /** 분봉 모드일 때 % 변환에 쓰는 prevClose. null이면 라인 미표시 */
    prevClose: number | null;
    /** true: 일봉(가격 그대로), false: 분봉(prevClose 기준 % 변환) */
    asPrice: boolean;
}

interface PriceLineListHandle extends IndicatorHandle {
    series: ISeriesApi<"Line">;
    lines: IPriceLine[];
}

/** 컬럼명 해시 기반 결정적 색상 매핑 */
const PRICE_LINE_PALETTE = [
    "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#14b8a6",
    "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444",
];

function hashKey(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
        h = (h * 31 + key.charCodeAt(i)) >>> 0;
    }
    return h;
}

function colorForKey(key: string): string {
    return PRICE_LINE_PALETTE[hashKey(key) % PRICE_LINE_PALETTE.length];
}

function stripPrefix(key: string): string {
    return key.startsWith("line_") ? key.slice(5) : key;
}

function buildLines(
    series: ISeriesApi<"Line">,
    priceLines: Record<string, number[]>,
    prevClose: number | null,
    asPrice: boolean,
): IPriceLine[] {
    const created: IPriceLine[] = [];
    for (const [key, prices] of Object.entries(priceLines)) {
        const color = colorForKey(key);
        const label = stripPrefix(key);
        for (const price of prices) {
            const chartValue = asPrice
                ? price
                : prevClose != null && prevClose > 0
                    ? ((price - prevClose) / prevClose) * 100
                    : null;
            if (chartValue === null) continue;
            created.push(
                series.createPriceLine({
                    price: chartValue,
                    color,
                    lineStyle: LineStyle.Dashed,
                    lineWidth: 1,
                    axisLabelVisible: true,
                    title: label,
                }),
            );
        }
    }
    return created;
}

export const priceLineListIndicator = {
    id: "priceLineList",
    label: "가격 라인 목록",

    attach(chart: IChartApi, params: PriceLineListParams): PriceLineListHandle {
        const series = chart.addLineSeries({ visible: false, priceScaleId: "right" });
        const lines = buildLines(series, params.priceLines, params.prevClose, params.asPrice);
        return { series, lines } as PriceLineListHandle;
    },

    update(handle: IndicatorHandle, params: PriceLineListParams) {
        const h = handle as PriceLineListHandle;
        for (const line of h.lines) {
            try { h.series.removePriceLine(line); } catch { /* noop */ }
        }
        h.lines = buildLines(h.series, params.priceLines, params.prevClose, params.asPrice);
    },

    detach(handle: IndicatorHandle, chart: IChartApi) {
        const h = handle as PriceLineListHandle;
        for (const line of h.lines) {
            try { h.series.removePriceLine(line); } catch { /* noop */ }
        }
        chart.removeSeries(h.series);
    },
};
