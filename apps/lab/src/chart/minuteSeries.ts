// MinuteChart 의 시리즈 수명주기 · 데이터 · 시각선 · 축 — lightweight-charts 명령형 어댑터.
// 골조(캔들+거래대금 2-pane·마커·세로선)는 일봉과 공용(buildCandleAmountSeries) — 분봉의 몫은 축 표기
// (당일 % / 가격)·% 축 autoscale 바닥·시각선의 거래대금 pane 연장.
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
    LineStyle,
    TickMarkType,
    type AutoscaleInfo,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import { RISE_FILL, FALL_FILL, AMOUNT_BUCKET_COLORS, AMOUNT_BUCKETS_EOK, amountBucketIndex, fmtPriceAxis, kstHHmm, kstMd } from "./chartUtils.js";
import { buildCandleAmountSeries } from "./candleAmountSeries.js";
import { type VertLines, type VertLineSpec } from "./vertLine.js";
import { snapToBar } from "./bars.js";
import { type MinutePoint } from "./derive.js";

const TIME_LINE_COLOR = "#2563eb"; // 경로 시각 세로선

/** 분봉 세로축 — 당일 %(그 날 하루, 전일 종가 대비) · 가격(수정주가 원화, 여러 날 이어 보기). */
export type MinuteAxis = "pct" | "price";

const PCT_FORMAT = { type: "custom" as const, formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`, minMove: 0.01 };
const PRICE_FORMAT = { type: "custom" as const, formatter: fmtPriceAxis, minMove: 1 };
// % 축은 기본 0~25%, 데이터가 넘으면 넓힌다. 가격 축은 데이터 그대로.
const pctAutoscale = (baseImpl: () => AutoscaleInfo | null): AutoscaleInfo | null => {
    const base = baseImpl();
    return {
        priceRange: {
            minValue: Math.min(0, base?.priceRange?.minValue ?? 0),
            maxValue: Math.max(25, base?.priceRange?.maxValue ?? 0),
        },
        margins: base?.margins,
    };
};
const priceAutoscale = (baseImpl: () => AutoscaleInfo | null): AutoscaleInfo | null => baseImpl();

export interface MinuteSeries {
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: MutableRefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: MutableRefObject<ISeriesMarkersPluginApi<Time> | null>;
    candleVertsRef: MutableRefObject<VertLines | null>;
    amountVertsRef: MutableRefObject<VertLines | null>;
    /** % 축의 0% 점선 — useMinuteAxis 가 % 축에서만 긋는다. */
    zeroLineRef: MutableRefObject<IPriceLine | null>;
    /**
     * 시리즈 세대 — 다시 만들어질 때마다 오른다(StrictMode 이중 effect·Fast Refresh). 시리즈는 ref 라 교체가
     * 렌더를 일으키지 않으므로, 데이터 effect 가 이 값에 의존해야 새 시리즈에 다시 밀어 넣는다(없으면 빈 차트).
     */
    gen: number;
}

/** 캔들(pane0, 축은 useMinuteAxis) + 거래대금(pane1, 억) 1회 생성 · 정리. */
export function useMinuteSeries(chartRef: RefObject<IChartApi | null>): MinuteSeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const candleVertsRef = useRef<VertLines | null>(null);
    const amountVertsRef = useRef<VertLines | null>(null);
    const zeroLineRef = useRef<IPriceLine | null>(null);
    const [gen, setGen] = useState(0);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const s = buildCandleAmountSeries(chart, {
            candleOptions: { priceFormat: PCT_FORMAT, autoscaleInfoProvider: pctAutoscale },
            verts: true, // 시각선이 거래대금 pane 까지 이어진다
        });
        candleRef.current = s.candle;
        amountRef.current = s.amount;
        markersRef.current = s.markers;
        candleVertsRef.current = s.verts?.candle ?? null;
        amountVertsRef.current = s.verts?.amount ?? null;
        setGen((g) => g + 1);
        return () => {
            // 셸(useChartShell)의 cleanup 이 먼저 돌아 chart.remove() 가 끝났을 수 있다(그때 chartRef.current === null).
            // 죽은 차트에 detachPrimitive 를 부르면 다음 프레임에 "Object is disposed" 가 비동기로 터진다 —
            // 차트가 살아 있는 재실행(StrictMode·Fast Refresh)에서만 걷는다.
            if (chartRef.current !== null) s.dispose();
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
            candleVertsRef.current = null;
            amountVertsRef.current = null;
            zeroLineRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleRef, amountRef, markersRef, candleVertsRef, amountVertsRef, zeroLineRef, gen };
}

/** points → 시리즈 데이터 + 조회 맵(time → 포인트, 툴팁·클릭용) + 거래대금 구간 마커(20억 이상 봉 위에 구간 하한). */
export function useMinuteSeriesData(series: MinuteSeries, points: MinutePoint[], showAmountMarkers: boolean): MutableRefObject<Map<number, MinutePoint>> {
    const pointMapRef = useRef<Map<number, MinutePoint>>(new Map());
    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;
        candle.setData(points.map((p) => ({ time: p.time as UTCTimestamp, open: p.open, high: p.high, low: p.low, close: p.close })));
        // 거래대금 0 인 봉(무거래 채움)은 막대를 생략한다.
        amount.setData(
            points.filter((p) => p.amount > 0).map((p) => ({ time: p.time as UTCTimestamp, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL })),
        );
        pointMapRef.current = new Map(points.map((p) => [p.time, p]));

        const markers = [];
        if (showAmountMarkers) {
            for (const p of points) {
                const b = amountBucketIndex(p.amount);
                if (b >= 0) markers.push({ time: p.time as UTCTimestamp, position: "aboveBar" as const, color: AMOUNT_BUCKET_COLORS[b], shape: "circle" as const, size: 0, text: `${AMOUNT_BUCKETS_EOK[b]}` });
            }
        }
        series.markersRef.current?.setMarkers(markers);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, showAmountMarkers, series.gen]);
    return pointMapRef;
}

/** 시각선 — markerTime 이하 마지막 봉에 세로 점선(캔들·거래대금 pane 둘 다). */
export function useTimeLine(series: MinuteSeries, points: MinutePoint[], markerTime: number | null): void {
    const snapped = useMemo(() => snapToBar(points, markerTime), [points, markerTime]);
    useEffect(() => {
        const specs: VertLineSpec[] = snapped == null ? [] : [{ time: snapped as UTCTimestamp, color: TIME_LINE_COLOR, width: 1, dashed: true }];
        series.candleVertsRef.current?.setLines(specs);
        series.amountVertsRef.current?.setLines(specs);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapped, series.gen]);
}

/**
 * 축 전환 — 세로축 표기·autoscale·0% 선, 그리고 시간축 눈금(가격 = 여러 날이라 날이 바뀌는 눈금에 월/일).
 * 차트·시리즈는 마운트 1회라 옵션을 갈아 끼운다.
 */
export function useMinuteAxis(chartRef: RefObject<IChartApi | null>, series: MinuteSeries, axis: MinuteAxis): void {
    useEffect(() => {
        const chart = chartRef.current;
        const candle = series.candleRef.current;
        if (!chart || !candle) return;
        const pct = axis === "pct";
        candle.applyOptions({ priceFormat: pct ? PCT_FORMAT : PRICE_FORMAT, autoscaleInfoProvider: pct ? pctAutoscale : priceAutoscale });
        // 손으로 끌어 둔 세로 범위는 단위가 바뀌면 의미가 없다(% 범위로 원화 봉이 화면 밖) — 자동 맞춤으로 되돌린다
        candle.priceScale().applyOptions({ autoScale: true });
        // 0% 점선은 % 축에만 — 가격 축에선 걷는다(lineVisible 로 숨기면 실측에서 남았다)
        if (pct && !series.zeroLineRef.current) {
            series.zeroLineRef.current = candle.createPriceLine({ price: 0, color: "rgba(150,150,150,0.5)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
        } else if (!pct && series.zeroLineRef.current) {
            candle.removePriceLine(series.zeroLineRef.current);
            series.zeroLineRef.current = null;
        }
        chart.applyOptions({
            // timeVisible — 꺼져 있으면 lightweight-charts 가 모든 눈금을 날짜 급으로 넘겨 가격 축 눈금이 전부 M/D 가 된다(실측)
            timeScale: { timeVisible: true, tickMarkFormatter: (t: number, type: TickMarkType) => (!pct && type <= TickMarkType.DayOfMonth ? kstMd(t) : kstHHmm(t)) },
            localization: { timeFormatter: (t: number) => (pct ? kstHHmm(t) : `${kstMd(t)} ${kstHHmm(t)}`) },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [axis, series.gen]);
}
