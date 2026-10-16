// 캔들+거래대금 2-pane 시리즈 한 벌 — 일봉·분봉 차트가 **같은 골조**를 쓴다.
//
// 차이는 **캔들의 축 표기뿐**이다(일봉=원화 가격 축 / 분봉=% 축 + autoscale 바닥) — 그래서 그 부분만
// candleOptions 로 받고 나머지는 여기 한 곳에 산다.
//
// 세로선(VertLines)은 옵션 — 분봉만 쓴다(경로 시각선이 캔들·거래대금 두 pane 을 같은 x 로 가로지른다).
import {
    CandlestickSeries,
    HistogramSeries,
    createSeriesMarkers,
    type CandlestickSeriesPartialOptions,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
} from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR, AMOUNT_BAR_COLOR } from "./chartUtils.js";
import { fmtEokValue } from "../lib/format.js";
import { VertLines, asPrimitive } from "./vertLine.js";

export interface CandleAmountSeries {
    candle: ISeriesApi<"Candlestick">;
    amount: ISeriesApi<"Histogram">;
    markers: ISeriesMarkersPluginApi<Time>;
    /** verts 옵션을 켰을 때만 — 안 켰으면 null(쓰지 않는 프리미티브를 얹지 않는다). */
    verts: { candle: VertLines; amount: VertLines } | null;
    /**
     * 프리미티브 detach — ⚠**살아있는 차트에서만** 부를 것. chart.remove() 뒤에 부르면 detachPrimitive
     * 가 동기로 안 던지고 model.fullUpdate() 로 새 draw rAF 를 심어, 다음 프레임에 파괴된 캔버스
     * 바인딩을 그리다 "Object is disposed"(fancy-canvas)가 비동기로 터진다 — try/catch 로 못 잡는다.
     * 호출자(useDailySeries·useMinuteSeries cleanup)가 chartRef.current 생존 확인으로 그 계약을 지킨다.
     */
    dispose: () => void;
}

/**
 * 캔들(pane0) + 거래대금 히스토그램(pane1, 억 · 1조 이상은 조 표기) + 마커 플러그인 + (옵션) 세로선 프리미티브.
 * `candleOptions` 가 공통 스타일 위에 덮인다 — 축 표기(priceFormat·autoscale)가 여기로 온다.
 */
export function buildCandleAmountSeries(
    chart: IChartApi,
    opts: { candleOptions: CandlestickSeriesPartialOptions; verts?: boolean },
): CandleAmountSeries {
    const candle = chart.addSeries(CandlestickSeries, {
        upColor: RISE_COLOR,
        downColor: FALL_COLOR,
        borderUpColor: RISE_COLOR,
        borderDownColor: FALL_COLOR,
        wickUpColor: RISE_COLOR,
        wickDownColor: FALL_COLOR,
        priceScaleId: "right",
        priceLineVisible: false,
        ...opts.candleOptions,
    });
    const amount = chart.addSeries(
        HistogramSeries,
        {
            priceScaleId: "right",
            priceFormat: { type: "custom", formatter: fmtEokValue, minMove: 1 }, // 툴팁·종목 줄과 같은 억/조 규칙
            priceLineVisible: false,
            lastValueVisible: false,
            color: AMOUNT_BAR_COLOR,
        },
        1,
    );
    // 캔들 pane : 거래대금 pane = 3 : 1
    chart.priceScale("right", 1).applyOptions({ borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
    const panes = chart.panes();
    panes[0]?.setStretchFactor(3);
    panes[1]?.setStretchFactor(1);

    const markers = createSeriesMarkers(candle);
    const verts = opts.verts ? { candle: new VertLines(), amount: new VertLines() } : null;
    if (verts) {
        candle.attachPrimitive(asPrimitive(verts.candle));
        amount.attachPrimitive(asPrimitive(verts.amount));
    }
    // try/catch 없음 — 죽은 차트에서의 detachPrimitive 는 안 던지고 비동기로 터지므로(위 dispose 주석)
    // catch 는 보호가 아니라 착시였다. 계약(살아있는 차트에서만)은 호출자가 지킨다.
    const dispose = (): void => {
        if (!verts) return;
        candle.detachPrimitive(asPrimitive(verts.candle));
        amount.detachPrimitive(asPrimitive(verts.amount));
    };
    return { candle, amount, markers, verts, dispose };
}
