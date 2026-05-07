import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import type { ChartIndicator, IndicatorHandle } from "./types";

export interface HLineParams {
    price: number;
    color?: string;
    title?: string;
}

interface HLineHandle extends IndicatorHandle {
    priceLine: IPriceLine;
    // priceLine을 붙이는 앵커 시리즈 (lightweight-charts는 chart 직접에 priceLine 불가)
    series: ISeriesApi<"Line">;
}

/**
 * 수평 기준선 지표.
 * docs/adding-chart-indicator.md 에서 참조하는 최소 구현 예시.
 */
export const horizontalLineIndicator: ChartIndicator<never, HLineParams> = {
    id: "horizontalLine",
    label: "수평 기준선",

    attach(chart: IChartApi, params: HLineParams): HLineHandle {
        const series = chart.addLineSeries({ visible: false, priceScaleId: "right" });
        const priceLine = series.createPriceLine({
            price: params.price,
            color: params.color ?? "rgba(251,191,36,0.8)",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: true,
            title: params.title ?? "",
        });
        return { priceLine, series } as HLineHandle;
    },

    // 수평선은 데이터 변경에 무반응
    update(_handle, _data) {},

    detach(handle: IndicatorHandle, chart: IChartApi) {
        const h = handle as HLineHandle;
        h.series.removePriceLine(h.priceLine);
        chart.removeSeries(h.series);
    },
};
