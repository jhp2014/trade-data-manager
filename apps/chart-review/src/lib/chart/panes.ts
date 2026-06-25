import type { IChartApi } from "lightweight-charts";

/**
 * 거래대금 histogram을 pane 1에 둔 차트의 pane 비율·가격축 마진을 설정한다.
 * (캔들 pane : 거래대금 pane = 3 : 1)
 *
 * 거래대금 시리즈는 호출 전 `chart.addSeries(HistogramSeries, opts, 1)`로
 * pane 1에 미리 생성돼 있어야 한다. 분봉·일봉이 공유한다.
 */
export function configureAmountPane(chart: IChartApi) {
    chart.priceScale("right", 1).applyOptions({
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
    });
    const panes = chart.panes();
    panes[0].setStretchFactor(3);
    panes[1].setStretchFactor(1);
}
