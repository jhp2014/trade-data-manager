import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CrosshairMode, LineStyle } from "lightweight-charts";
import { kstHHmm } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip } from "./chartShell.js";
import { FloatingTooltip } from "./tooltip.js";
import { MarkerCard, OhlcTooltip } from "./MinuteChartTooltips.js";
import {
    useMarkerOverlay,
    useMarkerVertLines,
    useMinuteInteraction,
    useMinuteSeries,
    useMinuteSeriesData,
    useMinuteVisibleRange,
    usePercentPriceLines,
    type SavedPointInput,
} from "./minuteChartHooks.js";
import type { MinutePoint } from "../lib/derive.js";
import type { RenderLine } from "../api/priceLines.js";

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
// 데이터는 이미 파생된 MinutePoint[](%/원). 명령형(lightweight-charts) 배선은 minuteChartHooks 의
// 훅들이 담당하고, 여기는 훅 조합 + 오버레이(타점 ▼·정보 카드)·툴팁 렌더만.
export function MinuteChart({
    points,
    frameKey,
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
    onPickPrice,
    capturePriceArmed = false,
}: {
    points: MinutePoint[];
    frameKey: string; // 데이터셋 정체성(code:date) — 이게 바뀔 때만 표시범위 리프레임(라이브 틱엔 뷰 보존).
    showAmountMarkers?: boolean;
    lines: RenderLine[]; // D+M 선(해소된 raw 가격). % 로 변환해 표시.
    base: number | null; // % 기준가(원)
    markerTime?: number | null; // 현재 타점 세로선(unix초). null = 없음.
    savedPoints?: SavedPointInput[]; // 저장된 복기 타점(unix초 + 연결 가설). 흐린 세로선 + hover 카드.
    showPointInfo?: boolean; // 현재 타점 정보 박스 토글
    zoom?: { bars: number; anchorTime: number | null } | null; // f 줌 — anchorTime 중심 ±bars/2 봉. null = 08:00~15:20 세션.
    onMovePoint: (time: string) => void; // 좌클릭 = 그 봉으로 타점 이동(tradeTime HH:MM:SS)
    onRightClick: (anchor: { date: string; time: string }) => void;
    onRemoveLine: (line: RenderLine) => void;
    onPickPrice?: (price: number) => void; // 무장 시 좌클릭 y좌표 → 가격(base×(1+%/100)) 캡처
    capturePriceArmed?: boolean;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
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

    // 명령형 배선 — 시리즈 수명주기 → 데이터 푸시 → 타점 세로선 → 표시범위 → 상호작용 → 가격선(%).
    const series = useMinuteSeries(chartRef);
    const { amountMapRef, cumMapRef, pointMapRef } = useMinuteSeriesData(series, points, showAmountMarkers);
    const { currentSnapped, savedSnapped } = useMarkerVertLines(series, points, markerTime, savedPoints);
    useMinuteVisibleRange(chartRef, points, zoom, frameKey, series.bumpOverlay);
    useMinuteInteraction({ chartRef, containerRef, candleRef: series.candleRef, pointMapRef, lines, base, onMovePoint, onRightClick, onRemoveLine, onPickPrice, captureArmed: capturePriceArmed });
    usePercentPriceLines(series.candleRef, lines, base);

    const { state: tip } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as number | undefined;
            if (t === undefined) return null;
            const d = param.seriesData.get(series.candleRef.current!) as
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
    const overlay = useMarkerOverlay(chartRef, series, pointMapRef, savedSnapped, currentSnapped);

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
