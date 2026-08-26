// MinuteChart 의 시리즈 수명주기 + 데이터 푸시 — lightweight-charts 명령형 어댑터의 "몸통".
// 골조(캔들+거래대금 2-pane·마커·프리미티브)는 일봉과 공용(buildCandleAmountSeries) — 분봉의 몫은
// % 축 표기·autoscale 바닥·타점 세로선의 거래대금 pane 연장뿐.
// 표시범위는 minuteFraming, 오버레이(세로선·아이콘·가격선)는 minuteOverlays, 마우스는 minuteInteraction.
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
    LineStyle,
    type AutoscaleInfo,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import { RISE_FILL, FALL_FILL, AMOUNT_BUCKET_COLORS } from "./chartUtils.js";
import { barSignature, buildCandleAmountSeries, extendsPrevBars, sameMarkers, useAppliedCache, type MarkerLike } from "./candleAmountSeries.js";
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { type VertLines } from "./vertLine.js";
import { type DropLines } from "./dropLine.js";
import { type MinutePoint } from "../lib/derive.js";

export interface MinuteSeries {
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: MutableRefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: MutableRefObject<ISeriesMarkersPluginApi<Time> | null>;
    candleVertsRef: MutableRefObject<VertLines | null>;
    amountVertsRef: MutableRefObject<VertLines | null>;
    /** 앵커 표식 드롭선 primitive — 표식 층이 spec 을 민다(안 밀면 빈 채로 아무것도 안 그린다). */
    dropRef: MutableRefObject<DropLines | null>;
    /** 오버레이(타점 아이콘·정보 박스) 위치 재계산 트리거 — pan/zoom·리사이즈·데이터 변경 시 bump. */
    overlayTick: number;
    bumpOverlay: () => void;
    /** 시리즈 세대 — 재생성될 때마다 오른다. 규약·이유는 DailySeries.gen 주석 참조(같은 규칙 한 벌). */
    gen: number;
}

/** 시리즈 수명주기 — 캔들(pane0, % 축) + 거래대금(pane1, 억) 1회 생성, 마커 플러그인·세로선 primitive 부착/정리. */
export function useMinuteSeries(chartRef: RefObject<IChartApi | null>): MinuteSeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const candleVertsRef = useRef<VertLines | null>(null);
    const amountVertsRef = useRef<VertLines | null>(null);
    const dropRef = useRef<DropLines | null>(null);
    const [overlayTick, setOverlayTick] = useState(0);
    const bumpOverlay = (): void => setOverlayTick((v) => v + 1);
    const [gen, setGen] = useState(0);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        // 골조(캔들+거래대금 2-pane·마커·프리미티브)는 일봉과 공용 — 분봉의 몫은 % 축 표기와
        // autoscale 바닥(기본 0~25%, 데이터가 넘으면 확장), 그리고 타점 세로선의 거래대금 pane 연장뿐.
        const s = buildCandleAmountSeries(chart, {
            candleOptions: {
                priceFormat: {
                    type: "custom",
                    formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
                    minMove: 0.01,
                },
                autoscaleInfoProvider: (baseImpl: () => AutoscaleInfo | null) => {
                    const base = baseImpl();
                    return {
                        priceRange: {
                            minValue: Math.min(0, base?.priceRange?.minValue ?? 0),
                            maxValue: Math.max(25, base?.priceRange?.maxValue ?? 0),
                        },
                        margins: base?.margins,
                    };
                },
            },
            amountVerts: true, // 타점 세로선이 아래 pane 까지 이어진다(같은 timeScale x 공유)
        });
        s.candle.createPriceLine({
            price: 0,
            color: "rgba(150,150,150,0.5)",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: false,
            title: "",
        });
        candleRef.current = s.candle;
        amountRef.current = s.amount;
        markersRef.current = s.markers;
        candleVertsRef.current = s.candleVerts;
        amountVertsRef.current = s.amountVerts;
        dropRef.current = s.drops;
        setGen((g) => g + 1); // 새 시리즈가 났다 — 데이터·마커 effect 를 다시 태운다
        // pan/zoom 시 오버레이 아이콘 위치 갱신.
        const ts = chart.timeScale();
        ts.subscribeVisibleLogicalRangeChange(bumpOverlay);
        return () => {
            try {
                ts.unsubscribeVisibleLogicalRangeChange(bumpOverlay);
            } catch {
                /* noop */
            }
            s.dispose();
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
            candleVertsRef.current = null;
            amountVertsRef.current = null;
            dropRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleRef, amountRef, markersRef, candleVertsRef, amountVertsRef, dropRef, overlayTick, bumpOverlay, gen };
}

export interface MinuteLookups {
    amountMapRef: MutableRefObject<Map<number, number>>;
    cumMapRef: MutableRefObject<Map<number, number>>;
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>;
}

/**
 * points → 시리즈 데이터 푸시 + 툴팁/오버레이 lookup 맵 + 거래대금 구간 마커(토글).
 *
 * **라이브 폴 증분** — 3초 폴마다 ~400봉 전체 setData 를 태우지 않는다. 새 points 가 직전 적용분의
 * 연장이면(extendsPrevBars: 같은 첫 봉·겹침 (time,지문) 동일) 바뀐 꼬리(마지막 old 봉 + 신규 봉)만
 * series.update() 로 민다. 판정이 조금이라도 어긋나거나 update 가 던지면 전체 setData 로 폴백
 * (정확성 > 절약). 표시범위 동작은 동일 — setData/update 둘 다 사용자 줌을 보존하고, 새 봉 추종은
 * timeScale 옵션의 몫이다. 마커는 계산 결과가 실제로 달라졌을 때만 setMarkers(sameMarkers 비교).
 */
export function useMinuteSeriesData(series: MinuteSeries, points: MinutePoint[], showAmountMarkers: boolean): MinuteLookups {
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const cumMapRef = useRef<Map<number, number>>(new Map());
    const pointMapRef = useRef<Map<number, MinutePoint>>(new Map());
    // 직전 적용분은 **그 시리즈에 밀어 넣은 것**만 인정한다 — 시리즈가 갈리면(StrictMode 이중 effect·
    // Fast Refresh) 증분도 마커 스킵도 근거를 잃는다(useAppliedCache 주석 참조). 일봉 훅과 같은 규칙.
    const applied = useAppliedCache<ISeriesApi<"Candlestick">, MinutePoint[]>();
    const appliedMarkers = useAppliedCache<ISeriesMarkersPluginApi<Time>, MarkerLike[]>();

    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;

        const prev = applied.read(candle);
        let incremental = false;
        // 증분 조건에 하나 더: 마지막 old 봉의 거래대금 막대가 **사라지는** 전이(>0 → 0)는 update 로 못 지운다.
        if (
            prev && extendsPrevBars(prev, points, (p) => p.time, barSignature) &&
            !(prev[prev.length - 1].amount > 0 && points[prev.length - 1].amount === 0)
        ) {
            try {
                for (let i = prev.length - 1; i < points.length; i++) {
                    const p = points[i];
                    candle.update({ time: p.time as UTCTimestamp, open: p.open, high: p.high, low: p.low, close: p.close });
                    if (p.amount > 0) {
                        amount.update({ time: p.time as UTCTimestamp, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL });
                    }
                    amountMapRef.current.set(p.time, p.amount);
                    cumMapRef.current.set(p.time, p.cumAmount);
                    pointMapRef.current.set(p.time, p);
                }
                incremental = true;
            } catch {
                incremental = false; // update 가 던지면(순서 어긋남 등) 아래 전체 setData 가 상태를 복구한다
            }
        }
        if (!incremental) {
            candle.setData(
                points.map((p) => ({ time: p.time as UTCTimestamp, open: p.open, high: p.high, low: p.low, close: p.close })),
            );
            const amountMap = new Map<number, number>();
            const cumMap = new Map<number, number>();
            const pointMap = new Map<number, MinutePoint>();
            const bars: Array<{ time: Time; value: number; color: string }> = [];
            for (const p of points) {
                amountMap.set(p.time, p.amount);
                cumMap.set(p.time, p.cumAmount);
                pointMap.set(p.time, p);
                if (p.amount > 0) {
                    bars.push({
                        time: p.time as UTCTimestamp,
                        value: p.amount / 1e8,
                        color: p.close >= p.open ? RISE_FILL : FALL_FILL,
                    });
                }
            }
            amountMapRef.current = amountMap;
            cumMapRef.current = cumMap;
            pointMapRef.current = pointMap;
            amount.setData(bars);
        }
        applied.write(candle, points);

        // 거래대금 마커 — 분당 거래대금 구간(≥30억) 봉 위에 숫자(구간 하한)만. 토글 OFF 면 비움.
        // setMarkers 는 전체 교체 API 라 증분이 없다 — 대신 결과가 지난번과 같으면(대부분의 폴 틱) 건너뛴다.
        const markers = [];
        if (showAmountMarkers) {
            for (const p of points) {
                const b = amountBucketIndex(p.amount);
                if (b >= 0) markers.push({ time: p.time as UTCTimestamp, position: "aboveBar" as const, color: AMOUNT_BUCKET_COLORS[b], shape: "circle" as const, size: 0, text: `${AMOUNT_BUCKETS_EOK[b]}` });
            }
        }
        const plugin = series.markersRef.current;
        if (plugin) {
            const prevMarkers = appliedMarkers.read(plugin);
            if (prevMarkers === null || !sameMarkers(markers, prevMarkers)) {
                plugin.setMarkers(markers);
                appliedMarkers.write(plugin, markers);
            }
        }
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, showAmountMarkers, series.gen]);

    return { amountMapRef, cumMapRef, pointMapRef };
}
