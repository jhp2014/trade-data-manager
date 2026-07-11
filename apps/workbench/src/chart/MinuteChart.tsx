import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    CandlestickSeries,
    HistogramSeries,
    CrosshairMode,
    LineStyle,
    createSeriesMarkers,
    type AutoscaleInfo,
    type IPriceLine,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import {
    kstHHmm,
    RISE_COLOR,
    FALL_COLOR,
    RISE_FILL,
    FALL_FILL,
    AMOUNT_BAR_COLOR,
    AMOUNT_BUCKET_COLORS,
} from "./chartUtils.js";
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { baseChartOptions, useChartShell, useCrosshairTooltip } from "./chartShell.js";
import { VertLines, asPrimitive, type VertLineSpec } from "./vertLine.js";
import { FloatingTooltip } from "./tooltip.js";
import { MarkerCard, OhlcTooltip } from "./MinuteChartTooltips.js";
import { kstToUnix, type MinutePoint } from "../lib/derive.js";
import type { RenderLine } from "../api/priceLines.js";

const MARKER_LINE_COLOR = "#2563eb"; // 현재 타점(Focus.time) 세로선 — 진한 파랑
const SAVED_LINE_COLOR = "rgba(120,120,130,0.45)"; // 저장된 복기 타점 — 흐린 회색
const LEFT_MARGIN_BARS = 10; // 좌측 여백(빈 논리 인덱스/시간) — 봉이 축에 바짝 붙지 않게
const MINUTE_BAR_SEC = 60; // 분봉 1봉 간격(초) — 좌측 여백을 시간 단위로 환산

/**
 * 세로선(x) 우측에 붙이는 오버레이 박스 — 우측 공간이 모자라면 좌측으로 뒤집는다.
 * 박스 실제 너비(가설 텍스트 길이 가변)를 측정해 판정하므로 폭 추정이 필요 없다.
 */
function AnchoredBox({
    x,
    top,
    containerWidth,
    zIndex,
    children,
    gap = 8,
}: {
    x: number;
    top: number;
    containerWidth: number;
    zIndex: number;
    children: ReactNode;
    gap?: number;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (el && el.offsetWidth !== w) setW(el.offsetWidth);
    });
    const flip = w > 0 && x + gap + w > containerWidth; // 우측에 안 들어가면 좌측 정렬
    return (
        <div
            ref={ref}
            style={{
                position: "absolute",
                left: flip ? x - gap : x + gap,
                top,
                transform: flip ? "translateX(-100%)" : undefined,
                zIndex,
                pointerEvents: "none",
            }}
        >
            {children}
        </div>
    );
}

// chart-review 참고 재구현: 캔들(등락률 %) pane + 거래대금(억) histogram pane + 크로스헤어 OHLC 툴팁.
// 데이터는 이미 파생된 MinutePoint[](%/원). 여기선 시리즈 렌더·툴팁·타점 상호작용을 담당.
export function MinuteChart({
    points,
    showAmountMarkers = true,
    lines,
    base,
    markerTime = null,
    savedPoints = [],
    showPointInfo = false,
    zoom = null,
    onMovePoint,
    onRightClick,
    onRemoveLine,
}: {
    points: MinutePoint[];
    showAmountMarkers?: boolean;
    lines: RenderLine[]; // D+M 선(해소된 raw 가격). % 로 변환해 표시.
    base: number | null; // % 기준가(원)
    markerTime?: number | null; // 현재 타점 세로선(unix초). null = 없음.
    savedPoints?: Array<{ time: number; hypotheses: string[] }>; // 저장된 복기 타점(unix초 + 연결 가설). 흐린 세로선 + hover 카드.
    showPointInfo?: boolean; // 현재 타점 정보 박스 토글
    zoom?: { bars: number; anchorTime: number | null } | null; // f 줌 — anchorTime 중심 ±bars/2 봉. null = 08:00~15:20 세션.
    onMovePoint: (time: string) => void; // 좌클릭 = 그 봉으로 타점 이동(tradeTime HH:MM:SS)
    onRightClick: (anchor: { date: string; time: string }) => void;
    onRemoveLine: (line: RenderLine) => void;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const candleVertsRef = useRef<VertLines | null>(null);
    const amountVertsRef = useRef<VertLines | null>(null);
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const cumMapRef = useRef<Map<number, number>>(new Map());
    const pointMapRef = useRef<Map<number, MinutePoint>>(new Map());
    const hoveredTimeRef = useRef<number | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const linesRef = useRef<RenderLine[]>(lines); // 우클릭 라벨-삭제 매칭용(현재 선 데이터)
    const baseRef = useRef<number | null>(base);
    linesRef.current = lines;
    baseRef.current = base;
    const onMovePointRef = useRef(onMovePoint);
    const onRightClickRef = useRef(onRightClick);
    const onRemoveLineRef = useRef(onRemoveLine);
    useEffect(() => {
        onMovePointRef.current = onMovePoint;
        onRightClickRef.current = onRightClick;
        onRemoveLineRef.current = onRemoveLine;
    });

    const chartRef = useChartShell(containerRef, () => ({
        ...baseChartOptions(),
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dashed, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dashed, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.04, bottom: 0.08 } },
        leftPriceScale: { visible: false },
        timeScale: {
            borderVisible: false,
            rightOffset: 2,
            tickMarkFormatter: (t: number) => kstHHmm(t),
        },
        localization: { locale: "ko-KR", timeFormatter: (t: number) => kstHHmm(t) },
    }));

    // 오버레이(타점 아이콘·정보 박스) 위치 재계산 트리거 — pan/zoom·리사이즈·데이터 변경 시 bump.
    const [overlayTick, setOverlayTick] = useState(0);
    const bumpOverlay = (): void => setOverlayTick((v) => v + 1);

    // 시리즈 1회 생성(캔들 pane0 + 거래대금 pane1).
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

    // markerTime/저장타점 → 실제 봉 시각으로 스냅(≤ target 최대). 범위 밖이면 null.
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
        const out: Array<{ time: number; hypotheses: string[] }> = [];
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
        candleVertsRef.current?.setLines(specs);
        amountVertsRef.current?.setLines(specs);
        bumpOverlay();
    }, [currentSnapped, savedSnapped]);

    // points 변경 시 데이터 푸시 + 툴팁 lookup 갱신.
    useEffect(() => {
        const candle = candleRef.current;
        const amount = amountRef.current;
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
        markersRef.current?.setMarkers(markers);
        bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, showAmountMarkers]);

    // 표시 범위 — f 줌: 현재 시각 중심 ±bars/2 봉 / 축소: 08:00~15:20 세션. 좌측에 여백(빈 시간대) 확보. (데이터·줌 변경 시 재적용)
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

    // 좌클릭 = 그 봉으로 타점 이동. 우클릭 = 선 삭제/추가(hover 봉 기준).
    useEffect(() => {
        const chart = chartRef.current;
        const el = containerRef.current;
        if (!chart || !el) return;
        const onMove = (param: { time?: unknown }): void => {
            hoveredTimeRef.current = typeof param.time === "number" ? param.time : null;
        };
        chart.subscribeCrosshairMove(onMove);
        const onClick = (param: { time?: unknown }): void => {
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

    // 가격선(D+M) 렌더 — raw 가격을 base 대비 %로 변환해 표시(분봉은 % 축).
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
                candle.createPriceLine({ price: pct, color: line.kind === "M" ? "#be7a00" : "#16796f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: line.kind }),
            );
        }
    }, [lines, base]);

    const { state: tip } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as number | undefined;
            if (t === undefined) return null;
            const d = param.seriesData.get(candleRef.current!) as
                | { open?: number; high?: number; low?: number; close?: number }
                | undefined;
            if (!d || d.close === undefined) return null;
            return (
                <OhlcTooltip
                    time={t}
                    open={d.open ?? d.close}
                    high={d.high ?? d.close}
                    low={d.low ?? d.close}
                    close={d.close}
                    amount={amountMapRef.current.get(t) ?? 0}
                    cumAmount={cumMapRef.current.get(t) ?? 0}
                />
            );
        },
    });

    // 툴팁 위치는 크로스헤어 좌표(pane마다 기준 다름) 대신 실제 커서 위치로 잡는다.
    const [cursor, setCursor] = useState({ x: 0, y: 0 });

    // 오버레이(타점 아이콘·현재 타점 정보) — 저장 타점 각각에 hover 아이콘, 현재 타점엔 토글 정보 박스.
    const [hoveredSaved, setHoveredSaved] = useState<number | null>(null);
    const overlay = useMemo(() => {
        void overlayTick; // 위치 재계산 의존
        const ts = chartRef.current?.timeScale();
        if (!ts) return { saved: [] as Array<{ x: number; point: MinutePoint | null; time: number; hypotheses: string[] }>, current: null as { x: number; point: MinutePoint | null; hypotheses: string[] } | null };
        const saved = savedSnapped.map((s) => {
            const c = ts.timeToCoordinate(s.time as UTCTimestamp);
            return { x: c == null ? -9999 : (c as number), point: pointMapRef.current.get(s.time) ?? null, time: s.time, hypotheses: s.hypotheses };
        });
        let current: { x: number; point: MinutePoint | null; hypotheses: string[] } | null = null;
        if (currentSnapped != null) {
            const c = ts.timeToCoordinate(currentSnapped as UTCTimestamp);
            if (c != null) {
                // 현재 타점이 저장 타점과 겹치면 그 타점의 가설을 물려 자동 표시(hover 없이도).
                const matched = savedSnapped.find((s) => s.time === currentSnapped);
                current = { x: c as number, point: pointMapRef.current.get(currentSnapped) ?? null, hypotheses: matched?.hypotheses ?? [] };
            }
        }
        return { saved, current };
    }, [overlayTick, savedSnapped, currentSnapped]);

    // 오버레이 박스 우/좌 판정용 컨테이너 폭 + 현재 hover 중인 저장 타점.
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const hoveredCard = hoveredSaved != null ? overlay.saved[hoveredSaved] : null;

    return (
        <div
            ref={containerRef}
            onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
            }}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            {/* 저장 타점 ▼ 마커 — 가설 있음=accent 채움 / 없음=밝은 채움+회색 윤곽. 드롭섀도로 띄우고 hover 시 확대. */}
            {overlay.saved.map((s, i) => {
                if (s.x < 0) return null;
                const hasHyp = s.hypotheses.length > 0;
                // hover 또는 현재 시간과 일치하면 활성(확대+그림자 강조).
                const isActive = hoveredSaved === i || s.time === currentSnapped;
                return (
                    <div
                        key={s.time}
                        onMouseEnter={() => setHoveredSaved(i)}
                        onMouseLeave={() => setHoveredSaved((cur) => (cur === i ? null : cur))}
                        title={hasHyp ? "저장된 타점 · 가설 연결" : "저장된 타점"}
                        style={{ position: "absolute", left: s.x - 7, top: 1, width: 14, height: 12, display: "flex", justifyContent: "center", cursor: "pointer", zIndex: 8 }}
                    >
                        <svg
                            width={12}
                            height={10}
                            viewBox="0 0 12 10"
                            style={{
                                overflow: "visible",
                                pointerEvents: "none",
                                filter: isActive ? "drop-shadow(0 2px 2.5px rgba(0,0,0,0.5))" : "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
                                transform: isActive ? "scale(1.35)" : "none",
                                transformOrigin: "50% 50%",
                                transition: "transform 0.1s ease, filter 0.1s ease",
                            }}
                        >
                            <polygon
                                points="1,1 11,1 6,9"
                                fill={hasHyp ? "var(--accent-hover, #2563eb)" : "var(--bg-primary, #ffffff)"}
                                stroke={hasHyp ? "none" : "rgba(90,90,105,0.95)"}
                                strokeWidth={hasHyp ? 0 : 1.4}
                            />
                        </svg>
                    </div>
                );
            })}
            {/* 저장 타점 hover 카드 — 세로선 우측(공간 없으면 좌측), 연결 가설 포함. */}
            {hoveredCard && hoveredCard.point && hoveredCard.x >= 0 && (
                <AnchoredBox x={hoveredCard.x} top={1} containerWidth={containerWidth} zIndex={10}>
                    <MarkerCard point={hoveredCard.point} hypotheses={hoveredCard.hypotheses} />
                </AnchoredBox>
            )}
            {/* 현재 타점(시간선) readout — 토글 ON 시 세로선 우측(공간 없으면 좌측) 한 줄. 저장 타점과 겹치면 가설도 자동 표시. */}
            {showPointInfo && overlay.current && overlay.current.point && (
                <AnchoredBox x={overlay.current.x} top={1} containerWidth={containerWidth} zIndex={9}>
                    <MarkerCard point={overlay.current.point} hypotheses={overlay.current.hypotheses} />
                </AnchoredBox>
            )}
            {tip.visible && (
                <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>
                    {tip.content}
                </FloatingTooltip>
            )}
        </div>
    );
}
