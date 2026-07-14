// MinuteChart 의 lightweight-charts 명령형 어댑터 훅들 — 시리즈 수명주기·데이터 푸시·타점 세로선·
// 표시범위(f 줌)·마우스 상호작용·가격선(%)·오버레이 좌표계산을 컴포넌트에서 분리.
// MinuteChart.tsx 는 훅 조합 + 오버레이/툴팁 렌더만 남는다(명령형 API 와 선언형 JSX 의 경계).
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
    CandlestickSeries,
    HistogramSeries,
    LineStyle,
    createSeriesMarkers,
    type AutoscaleInfo,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR, RISE_FILL, FALL_FILL, AMOUNT_BAR_COLOR, AMOUNT_BUCKET_COLORS } from "./chartUtils.js";
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { VertLines, asPrimitive, type VertLineSpec } from "./vertLine.js";
import { kstToUnix, type MinutePoint } from "../lib/derive.js";
import type { RenderLine } from "../api/priceLines.js";

const MARKER_LINE_COLOR = "#2563eb"; // 현재 타점(Focus.time) 세로선 — 진한 파랑
const SAVED_LINE_COLOR = "rgba(120,120,130,0.45)"; // 저장된 복기 타점 — 흐린 회색
const LEFT_MARGIN_BARS = 10; // 좌측 여백(빈 논리 인덱스/시간) — 봉이 축에 바짝 붙지 않게
const MINUTE_BAR_SEC = 60; // 분봉 1봉 간격(초) — 좌측 여백을 시간 단위로 환산

/** 저장 타점 입력(스냅 전) — unix초 + 연결 가설 텍스트. */
export interface SavedPointInput {
    time: number;
    hypotheses: string[];
}

export interface MinuteSeries {
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: MutableRefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: MutableRefObject<ISeriesMarkersPluginApi<Time> | null>;
    candleVertsRef: MutableRefObject<VertLines | null>;
    amountVertsRef: MutableRefObject<VertLines | null>;
    /** 오버레이(타점 아이콘·정보 박스) 위치 재계산 트리거 — pan/zoom·리사이즈·데이터 변경 시 bump. */
    overlayTick: number;
    bumpOverlay: () => void;
}

/** 시리즈 수명주기 — 캔들(pane0, % 축) + 거래대금(pane1, 억) 1회 생성, 마커 플러그인·세로선 primitive 부착/정리. */
export function useMinuteSeries(chartRef: RefObject<IChartApi | null>): MinuteSeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const candleVertsRef = useRef<VertLines | null>(null);
    const amountVertsRef = useRef<VertLines | null>(null);
    const [overlayTick, setOverlayTick] = useState(0);
    const bumpOverlay = (): void => setOverlayTick((v) => v + 1);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const candle = chart.addSeries(CandlestickSeries, {
            upColor: RISE_COLOR,
            downColor: FALL_COLOR,
            borderUpColor: RISE_COLOR,
            borderDownColor: FALL_COLOR,
            wickUpColor: RISE_COLOR,
            wickDownColor: FALL_COLOR,
            priceScaleId: "right",
            priceLineVisible: false,
            priceFormat: {
                type: "custom",
                formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
                minMove: 0.01,
            },
            // 기본 0~25%, 데이터가 넘으면 확장.
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
        });
        candle.createPriceLine({
            price: 0,
            color: "rgba(150,150,150,0.5)",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: false,
            title: "",
        });
        const amount = chart.addSeries(
            HistogramSeries,
            {
                priceScaleId: "right",
                priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}억`, minMove: 1 },
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

        candleRef.current = candle;
        amountRef.current = amount;
        markersRef.current = createSeriesMarkers(candle);
        // 타점 세로선 primitive — 캔들·거래대금 두 pane 에 각각 부착(같은 timeScale x 공유 → 아래까지 이어짐).
        const candleVerts = new VertLines();
        const amountVerts = new VertLines();
        candle.attachPrimitive(asPrimitive(candleVerts));
        amount.attachPrimitive(asPrimitive(amountVerts));
        candleVertsRef.current = candleVerts;
        amountVertsRef.current = amountVerts;
        // pan/zoom 시 오버레이 아이콘 위치 갱신.
        const ts = chart.timeScale();
        ts.subscribeVisibleLogicalRangeChange(bumpOverlay);
        return () => {
            try {
                ts.unsubscribeVisibleLogicalRangeChange(bumpOverlay);
                candle.detachPrimitive(asPrimitive(candleVerts));
                amount.detachPrimitive(asPrimitive(amountVerts));
            } catch {
                /* noop */
            }
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
            candleVertsRef.current = null;
            amountVertsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleRef, amountRef, markersRef, candleVertsRef, amountVertsRef, overlayTick, bumpOverlay };
}

export interface MinuteLookups {
    amountMapRef: MutableRefObject<Map<number, number>>;
    cumMapRef: MutableRefObject<Map<number, number>>;
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>;
}

/** points → 시리즈 데이터 푸시 + 툴팁/오버레이 lookup 맵 + 거래대금 구간 마커(토글). */
export function useMinuteSeriesData(series: MinuteSeries, points: MinutePoint[], showAmountMarkers: boolean): MinuteLookups {
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const cumMapRef = useRef<Map<number, number>>(new Map());
    const pointMapRef = useRef<Map<number, MinutePoint>>(new Map());

    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;

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
        // 거래대금 마커 — 분당 거래대금 구간(≥30억) 봉 위에 숫자(구간 하한)만. 토글 OFF 면 비움.
        const markers = [];
        if (showAmountMarkers) {
            for (const p of points) {
                const b = amountBucketIndex(p.amount);
                if (b >= 0) markers.push({ time: p.time as UTCTimestamp, position: "aboveBar" as const, color: AMOUNT_BUCKET_COLORS[b], shape: "circle" as const, size: 0, text: `${AMOUNT_BUCKETS_EOK[b]}` });
            }
        }
        series.markersRef.current?.setMarkers(markers);
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, showAmountMarkers]);

    return { amountMapRef, cumMapRef, pointMapRef };
}

/** 타점 세로선 — markerTime/저장타점을 실제 봉 시각으로 스냅(≤ target 최대)해 두 pane primitive 에 push. */
export function useMarkerVertLines(
    series: MinuteSeries,
    points: MinutePoint[],
    markerTime: number | null,
    savedPoints: SavedPointInput[],
): { currentSnapped: number | null; savedSnapped: SavedPointInput[] } {
    const snapToBar = (target: number | null): number | null => {
        if (target == null) return null;
        let snapped: number | null = null;
        for (const p of points) {
            if (p.time <= target) snapped = p.time;
            else break;
        }
        return snapped;
    };
    const currentSnapped = useMemo(() => snapToBar(markerTime), [markerTime, points]); // eslint-disable-line react-hooks/exhaustive-deps
    const savedSnapped = useMemo(() => {
        const seen = new Set<number>();
        const out: SavedPointInput[] = [];
        for (const sp of savedPoints) {
            const s = snapToBar(sp.time);
            if (s != null && !seen.has(s)) {
                seen.add(s);
                out.push({ time: s, hypotheses: sp.hypotheses });
            }
        }
        return out;
    }, [savedPoints, points]); // eslint-disable-line react-hooks/exhaustive-deps

    // 세로선 갱신 — 현재 타점(진한) + 저장 타점(흐린). 두 pane primitive 에 동일 리스트 push.
    useEffect(() => {
        const specs: VertLineSpec[] = [];
        for (const s of savedSnapped) {
            if (s.time === currentSnapped) continue; // 현재 타점과 겹치면 진한 선만
            specs.push({ time: s.time as UTCTimestamp, color: SAVED_LINE_COLOR, width: 1, dashed: true });
        }
        if (currentSnapped != null) {
            specs.push({ time: currentSnapped as UTCTimestamp, color: MARKER_LINE_COLOR, width: 1, dashed: true });
        }
        series.candleVertsRef.current?.setLines(specs);
        series.amountVertsRef.current?.setLines(specs);
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSnapped, savedSnapped]);

    return { currentSnapped, savedSnapped };
}

/** 표시 범위 — f 줌: anchor 중심 ±bars/2 봉 / 축소: 08:00~15:20 세션. 좌측 여백(빈 시간대) 확보. */
export function useMinuteVisibleRange(
    chartRef: RefObject<IChartApi | null>,
    points: MinutePoint[],
    zoom: { bars: number; anchorTime: number | null } | null,
    bumpOverlay: () => void,
): void {
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        const ts = chart.timeScale();
        if (zoom) {
            let idx = points.length - 1;
            if (zoom.anchorTime != null) {
                for (let i = 0; i < points.length; i++) { if (points[i].time <= zoom.anchorTime) idx = i; else break; }
            }
            const half = zoom.bars / 2;
            ts.setVisibleLogicalRange({ from: idx - half - LEFT_MARGIN_BARS, to: idx + half });
        } else {
            ts.setVisibleRange({ from: (points[0].time - LEFT_MARGIN_BARS * MINUTE_BAR_SEC) as UTCTimestamp, to: kstToUnix(points[0].date, "15:20:00") as UTCTimestamp });
        }
        bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, zoom]);
}

/** 마우스 상호작용 — 좌클릭=그 봉으로 타점 이동, 우클릭=선 근처면 삭제/아니면 hover 봉에 M 선 추가. */
export function useMinuteInteraction(args: {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>;
    lines: RenderLine[]; // 우클릭 라벨-삭제 매칭용(현재 선 데이터)
    base: number | null; // % 기준가(원)
    onMovePoint: (time: string) => void;
    onRightClick: (anchor: { date: string; time: string }) => void;
    onRemoveLine: (line: RenderLine) => void;
    onPickPrice?: (price: number) => void; // 무장 시 좌클릭 y좌표(%) → 가격(base×(1+%/100)) 캡처
    captureArmed?: boolean;
}): void {
    const { chartRef, containerRef, candleRef, pointMapRef, lines, base, onMovePoint, onRightClick, onRemoveLine, onPickPrice, captureArmed } = args;
    const hoveredTimeRef = useRef<number | null>(null);
    const linesRef = useRef<RenderLine[]>(lines);
    const baseRef = useRef<number | null>(base);
    linesRef.current = lines;
    baseRef.current = base;
    const onMovePointRef = useRef(onMovePoint);
    const onRightClickRef = useRef(onRightClick);
    const onRemoveLineRef = useRef(onRemoveLine);
    const onPickPriceRef = useRef(onPickPrice);
    const armedRef = useRef(captureArmed ?? false);
    useEffect(() => {
        onMovePointRef.current = onMovePoint;
        onRightClickRef.current = onRightClick;
        onRemoveLineRef.current = onRemoveLine;
        onPickPriceRef.current = onPickPrice;
        armedRef.current = captureArmed ?? false;
    });

    useEffect(() => {
        const chart = chartRef.current;
        const el = containerRef.current;
        if (!chart || !el) return;
        const onMove = (param: { time?: unknown }): void => {
            hoveredTimeRef.current = typeof param.time === "number" ? param.time : null;
        };
        chart.subscribeCrosshairMove(onMove);
        const onClick = (param: { time?: unknown; point?: { x: number; y: number }; paneIndex?: number }): void => {
            if (armedRef.current) {
                // 무장(가격 leaf 편집 중) 시 좌클릭 = y좌표 % → 가격 캡처(캔들 pane0만). 타점 이동 억제.
                const b = baseRef.current;
                if (onPickPriceRef.current && param.point && (param.paneIndex ?? 0) === 0 && b && b > 0) {
                    const pct = candleRef.current?.coordinateToPrice(param.point.y);
                    if (pct != null) onPickPriceRef.current(b * (1 + (pct as number) / 100));
                }
                return;
            }
            const t = typeof param.time === "number" ? param.time : null;
            const p = t != null ? pointMapRef.current.get(t) : null;
            if (p) onMovePointRef.current(p.tradeTime);
        };
        chart.subscribeClick(onClick);
        const onCtx = (e: MouseEvent): void => {
            e.preventDefault();
            const candle = candleRef.current;
            const b = baseRef.current;
            const y = e.clientY - el.getBoundingClientRect().top;
            // 1) 기존 선(라벨/선) 근처 우클릭 → 그 선 삭제(봉 일일이 찾을 필요 없음).
            if (candle && b && b > 0) {
                for (const line of linesRef.current) {
                    const pct = ((line.price - b) / b) * 100;
                    const ly = candle.priceToCoordinate(pct);
                    if (ly != null && Math.abs((ly as number) - y) <= 6) {
                        onRemoveLineRef.current(line);
                        return;
                    }
                }
            }
            // 2) 아니면 hover 중인 분봉에 M 선 추가 — 그 분의 (날짜,시각) 앵커. 값은 표시 시점 고가에서 읽음.
            const t = hoveredTimeRef.current;
            const p = t != null ? pointMapRef.current.get(t) : null;
            if (p) onRightClickRef.current({ date: p.date, time: p.tradeTime });
        };
        el.addEventListener("contextmenu", onCtx);
        return () => {
            chart.unsubscribeCrosshairMove(onMove);
            chart.unsubscribeClick(onClick);
            el.removeEventListener("contextmenu", onCtx);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/** 가격선(D+M) 렌더 — raw 가격을 base 대비 %로 변환해 표시(분봉은 % 축). */
export function usePercentPriceLines(
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>,
    lines: RenderLine[],
    base: number | null,
): void {
    const priceLinesRef = useRef<IPriceLine[]>([]);
    useEffect(() => {
        const candle = candleRef.current;
        if (!candle) return;
        for (const h of priceLinesRef.current) {
            try {
                candle.removePriceLine(h);
            } catch {
                /* noop */
            }
        }
        priceLinesRef.current = [];
        if (!base || base <= 0) return;
        for (const line of lines) {
            const pct = ((line.price - base) / base) * 100;
            priceLinesRef.current.push(
                candle.createPriceLine({ price: pct, color: line.kind === "A" ? "#dc2626" : line.kind === "M" ? "#be7a00" : "#16796f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: line.label ?? line.kind }),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lines, base]);
}

export interface MarkerOverlay {
    saved: Array<{ x: number; point: MinutePoint | null; time: number; hypotheses: string[] }>;
    current: { x: number; point: MinutePoint | null; hypotheses: string[] } | null;
}

/** 오버레이 좌표 — 스냅된 타점들을 timeScale 좌표로 변환(overlayTick 이 pan/zoom/데이터 변경 재계산 트리거). */
export function useMarkerOverlay(
    chartRef: RefObject<IChartApi | null>,
    series: MinuteSeries,
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>,
    savedSnapped: SavedPointInput[],
    currentSnapped: number | null,
): MarkerOverlay {
    return useMemo(() => {
        void series.overlayTick; // 위치 재계산 의존
        const ts = chartRef.current?.timeScale();
        if (!ts) return { saved: [], current: null };
        const saved = savedSnapped.map((s) => {
            const c = ts.timeToCoordinate(s.time as UTCTimestamp);
            return { x: c == null ? -9999 : (c as number), point: pointMapRef.current.get(s.time) ?? null, time: s.time, hypotheses: s.hypotheses };
        });
        let current: MarkerOverlay["current"] = null;
        if (currentSnapped != null) {
            const c = ts.timeToCoordinate(currentSnapped as UTCTimestamp);
            if (c != null) {
                // 현재 타점이 저장 타점과 겹치면 그 타점의 가설을 물려 자동 표시(hover 없이도).
                const matched = savedSnapped.find((s) => s.time === currentSnapped);
                current = { x: c as number, point: pointMapRef.current.get(currentSnapped) ?? null, hypotheses: matched?.hypotheses ?? [] };
            }
        }
        return { saved, current };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series.overlayTick, savedSnapped, currentSnapped]);
}
