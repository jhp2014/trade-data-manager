// DailyChart 의 lightweight-charts 명령형 어댑터 — 시리즈 수명주기 · 데이터 · 표시범위.
// DailyChart.tsx 는 훅 조합 + 툴팁 렌더만 남는다(명령형 API 와 선언형 JSX 의 경계).
import { useEffect, useRef, useState, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type Time } from "lightweight-charts";
import { RISE_FILL, FALL_FILL, fmtPriceAxis, highMarkerColor } from "./chartUtils.js";
import { buildCandleAmountSeries } from "./candleAmountSeries.js";
import type { DailyPoint } from "./derive.js";

const LEFT_MARGIN_BARS = 3; // 좌측 여백(빈 논리 인덱스)
const RIGHT_MARGIN_BARS = 10; // 우측 여백 — 마지막 봉이 축에 붙지 않게

export interface DailySeries {
    candleRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: RefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: RefObject<ISeriesMarkersPluginApi<Time> | null>;
    /** 시리즈 세대 — 규약은 MinuteSeries.gen 과 같다(새 시리즈에 데이터를 다시 밀어 넣게 한다). */
    gen: number;
}

/** 캔들(원화 가격 축) + 거래대금 pane + 마커 플러그인. 마운트 1회. */
export function useDailySeries(chartRef: RefObject<IChartApi | null>): DailySeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const [gen, setGen] = useState(0);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const s = buildCandleAmountSeries(chart, {
            // 가격 축은 천 단위 쉼표 — 숫자만 늘어서면 금액이 한눈에 안 들어온다.
            candleOptions: { lastValueVisible: false, priceFormat: { type: "custom", formatter: fmtPriceAxis, minMove: 1 } },
        });
        candleRef.current = s.candle;
        amountRef.current = s.amount;
        markersRef.current = s.markers;
        setGen((g) => g + 1);
        return () => {
            // 죽은 차트에 detachPrimitive 를 부르지 않는다 — minuteSeries 의 같은 자리 주석 참조.
            if (chartRef.current !== null) s.dispose();
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleRef, amountRef, markersRef, gen };
}

/** 데이터(캔들·거래대금) + 고가 등락률 마커(전일비 10% 이상) + 날짜→봉 조회 맵(툴팁용). */
export function useDailySeriesData(series: DailySeries, points: DailyPoint[]): { readonly current: Map<string, DailyPoint> } {
    const mapRef = useRef<Map<string, DailyPoint>>(new Map());
    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;
        candle.setData(points.map((p) => ({ time: p.time as Time, open: p.open, high: p.high, low: p.low, close: p.close })));
        amount.setData(points.map((p) => ({ time: p.time as Time, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL })));
        mapRef.current = new Map(points.map((p) => [p.time, p]));

        const markers = [];
        for (const p of points) {
            const color = p.highPct === null ? null : highMarkerColor(p.highPct);
            if (p.highPct === null || color === null) continue;
            markers.push({ time: p.time as Time, position: "aboveBar" as const, color, shape: "circle" as const, size: 1, text: p.highPct.toFixed(1) });
        }
        series.markersRef.current?.setMarkers(markers);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, series.gen]);
    return mapRef;
}

/** 표시 범위 — 최근 visibleBars 봉. 데이터셋(frameKey)이 바뀔 때만 다시 잡는다(사용자 줌·이동 보존). */
export function useDailyVisibleRange(chartRef: RefObject<IChartApi | null>, points: DailyPoint[], frameKey: string, visibleBars: number): void {
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        const n = points.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - visibleBars) - LEFT_MARGIN_BARS, to: n + RIGHT_MARGIN_BARS });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameKey, visibleBars]);
}
