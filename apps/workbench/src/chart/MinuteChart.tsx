import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CrosshairMode, LineStyle } from "lightweight-charts";
import { kstHHmm } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip, useRafCursor } from "./chartShell.js";
import { FloatingTooltip } from "./tooltip.js";
import { MarkerCard, OhlcTooltip } from "./MinuteChartTooltips.js";
import { AnchorMarkLayer } from "./AnchorMarkLayer.js";
import { CHIP_TOP_PAD_MINUTE, useAnchorMarkOverlay } from "./anchorMarkOverlay.js";
import { useMinuteAnchorMarkArgs } from "./anchorMarkArgs.js";
import type { AnchorMark } from "../lib/anchorMarks.js";
import { useMinuteSeries, useMinuteSeriesData } from "./minuteSeries.js";
import { useMinuteVisibleRange } from "./minuteFraming.js";
import {
    useMarkerOverlay,
    useMarkerVertLines,
    usePercentPriceLines,
    type AutoPointInput,
} from "./minuteOverlays.js";
import { useMinuteInteraction, GROUP_MARKER_ATTR } from "./minuteInteraction.js";
import type { MinutePoint } from "../lib/derive.js";
import type { RenderLine } from "../lib/chartFrame.js";
import { AUTO_POINT, MARKER_NOW } from "../styles/palette.js";

/**
 * 세로선(x) 우측에 붙이는 오버레이 박스 — 우측 공간이 모자라면 좌측으로 뒤집는다.
 * 박스 실제 너비를 측정해 판정하므로 폭 추정이 필요 없다.
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

/**
 * 마커 기하 — 시간선 ▼ 와 타점 ◇ 가 **같은 크기·같은 높이**에 서도록 한 곳에서만 정한다.
 * (따로 적었을 땐 시간선 쪽이 축소 뷰박스 + 인라인 svg 베이스라인만큼 작고 낮게 그려졌다.)
 */
const MARKER_BOX = { w: 18, h: 14 } as const;

// prop 기본값은 모듈 상수로 — `= []` 인라인이면 렌더마다 새 참조라 세로선 effect(setLines+bumpOverlay)가
// 매 렌더 발화한다(실시간 차트처럼 안 넘기는 호출자에서).
const NO_AUTO: AutoPointInput[] = [];

function markerBoxStyle(x: number, zIndex: number): CSSProperties {
    return {
        position: "absolute",
        left: x - MARKER_BOX.w / 2,
        top: 0,
        width: MARKER_BOX.w,
        height: MARKER_BOX.h,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 1,
        zIndex,
    };
}

/** 시간선 ▼ — 색은 언제나 MARKER_NOW(호출부 하나). hover 강조가 없으므로 변형도 없다. */
function MarkerTriangle({ fill, stroke }: { fill: string; stroke: string }): JSX.Element {
    return (
        <svg
            width={12}
            height={10}
            viewBox="0 0 12 10"
            style={{
                display: "block", // 인라인 baseline 만큼 내려앉지 않게
                overflow: "visible",
                pointerEvents: "none",
                filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
            }}
        >
            <polygon points="1,1 11,1 6,9" fill={fill} stroke={stroke} strokeWidth={1.4} />
        </svg>
    );
}

/**
 * 타점 ◇ — 시간선 ▼ 와 **모양으로** 갈린다(색만으로 가르면 작은 크기에서 섞인다).
 * 두 뜻을 **다른 채널**로 나눠 싣는다: `now`(시간선이 이 타점 위) = 색, `active`(hover) = 크기.
 * 한 채널에 둘을 얹으면 "현재"와 "마우스가 위에 있다"가 픽셀 단위로 같은 그림이 된다.
 */
function MarkerDiamond({ active = false, now = false }: { active?: boolean; now?: boolean }): JSX.Element {
    return (
        <svg
            width={10}
            height={10}
            viewBox="0 0 10 10"
            style={{
                display: "block",
                overflow: "visible",
                pointerEvents: "none",
                filter: active ? "drop-shadow(0 2px 2.5px rgba(0,0,0,0.5))" : "drop-shadow(0 1px 1.5px rgba(0,0,0,0.3))",
                transform: active ? "scale(1.3)" : "none",
                transformOrigin: "50% 50%",
                transition: "transform 0.1s ease",
            }}
        >
            <polygon points="5,1 9,5 5,9 1,5" fill={now ? MARKER_NOW : "var(--bg-primary, #ffffff)"} stroke={now ? MARKER_NOW : AUTO_POINT} strokeWidth={1.4} />
        </svg>
    );
}

// chart-review 참고 재구현: 캔들(등락률 %) pane + 거래대금(억) histogram pane + 크로스헤어 OHLC 툴팁.
// 데이터는 이미 파생된 MinutePoint[](%/원). 명령형(lightweight-charts) 배선은 minuteSeries(수명주기·
// 데이터)·minuteFraming(표시범위)·minuteOverlays(세로선·가격선·골격)·minuteInteraction(마우스) 훅들이
// 담당하고, 여기는 훅 조합 + 오버레이(타점 ◇·정보 카드)·툴팁 렌더만.

export function MinuteChart({
    points,
    frameKey,
    showAmountMarkers = true,
    lines,
    base,
    pctBase,
    markerTime = null,
    autoPoints = NO_AUTO,
    showPointInfo = false,
    zoom = null,
    lockTimeScale = false,
    onMovePoint,
    onRightClick,
    onRemoveLine,
    onLineContext,
    onPickPrice,
    capturePriceArmed = false,
    anchorMarks,
}: {
    points: MinutePoint[];
    frameKey: string; // 데이터셋 정체성(code:date) — 이게 바뀔 때만 표시범위 리프레임(라이브 틱엔 뷰 보존).
    showAmountMarkers?: boolean;
    lines: RenderLine[]; // D+M+A 선. % 변환 분모는 종류별(linePct): D=pctBase, M/A=base.
    base: number | null; // % 기준가(당일 원주가) — 캔들·M/A 선·가격 캡처 분모
    pctBase: number | null; // % 기준가(수정주가 전일종가) — D 선 분모
    markerTime?: number | null; // 현재 타점 세로선(unix초). null = 없음.
    /** 자동 Point(격자 파생, unix초+라벨). ◇ 마커 + 청록 세로선 + hover 카드 — 안 넘기면 없음(실시간 차트가 그렇다). */
    autoPoints?: AutoPointInput[];
    showPointInfo?: boolean; // 현재 타점 정보 박스 토글
    zoom?: { bars: number; anchorTime: number | null } | null; // f 줌 — anchorTime 중심 ±bars/2 봉. null = 세션 기본(07:50/08:50~15:30).
    lockTimeScale?: boolean; // 스케일 고정 — 종목/날짜 전환에도 보던 시각 창 유지(리프레임 안 함)
    onMovePoint: (time: string) => void; // 좌클릭 = 그 봉으로 타점 이동(tradeTime HH:MM:SS)
    onRightClick: (anchor: { date: string; time: string }, at: { x: number; y: number }) => void;
    onRemoveLine: (line: RenderLine) => void;
    /** 있으면 선 근처 우클릭 = 메뉴(복기), 없으면 즉시 삭제(실시간). */
    onLineContext?: (line: RenderLine, at: { x: number; y: number }) => void;
    onPickPrice?: (price: number) => void; // 무장 시 좌클릭 y좌표 → 가격(base×(1+%/100)) 캡처
    capturePriceArmed?: boolean;
    /**
     * 상단 앵커 표식(분봉 grain 만) — 칩 + 봉당 드롭선. 안 넘기면 표식이 없다(실시간 차트가 그렇다).
     * **도메인 ChartAnchor 가 아니라 뷰모델**이다 — 새 param 이 늘어도 이 컴포넌트는 안 바뀐다.
     */
    anchorMarks?: readonly AnchorMark[];
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
    const { currentSnapped, autoSnapped } = useMarkerVertLines(series, points, markerTime, autoPoints);
    useMinuteVisibleRange(chartRef, points, zoom, frameKey, series.bumpOverlay, lockTimeScale);
    useMinuteInteraction({ chartRef, containerRef, candleRef: series.candleRef, pointMapRef, lines, base, pctBase, onMovePoint, onRightClick, onRemoveLine, onLineContext, onPickPrice, captureArmed: capturePriceArmed });
    usePercentPriceLines(series.candleRef, lines, base, pctBase);

    // 앵커 표식 — 칩은 SVG 층(타점 ▼ 아래에서 시작), 드롭선은 primitive(가격축까지 따라야 해서 층이 갈린다).
    const markArgs = useMinuteAnchorMarkArgs(chartRef, points, anchorMarks, showAmountMarkers);
    const markLayout = useAnchorMarkOverlay({
        chartRef, containerRef, dropRef: series.dropRef, overlayTick: series.overlayTick, gen: series.gen,
        topPad: CHIP_TOP_PAD_MINUTE, ...markArgs,
    });

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

    // 툴팁 위치는 크로스헤어 좌표(pane마다 기준 다름) 대신 실제 커서 위치로 잡는다(rAF 스로틀 — 프레임당 1회).
    const { cursor, onCursorMove } = useRafCursor();

    // 오버레이(타점 ◇·현재 시간선 정보) — 자동 Point 각각에 hover 아이콘, 현재 시각엔 토글 정보 박스.
    // hover 손잡이는 **스냅 시각**(a.time) — 배열 인덱스로 잡으면 hover 중 목록이 바뀔 때 옆 타점 카드가 뜬다.
    const [hoveredAuto, setHoveredAuto] = useState<number | null>(null);
    const overlay = useMarkerOverlay(chartRef, series, pointMapRef, autoSnapped, currentSnapped);
    const autoLabelOf = (time: number): string => autoSnapped.find((a) => a.time === time)?.label ?? "자동 Point";

    // 오버레이 박스 우/좌 판정용 컨테이너 폭 + 현재 hover 중인 타점.
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const hoveredCard = hoveredAuto != null ? overlay.marks.find((a) => a.time === hoveredAuto) ?? null : null;

    return (
        <div
            ref={containerRef}
            onMouseMove={onCursorMove}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            <AnchorMarkLayer layout={markLayout} onGoTo={markArgs.goTo} />
            {/* 자동 Point ◇ — 클릭 = 시간선 이동, title = 요약. 손 타점 ▼ 줄은 2026-09-01 폐지. */}
            {overlay.marks.map((a) => {
                if (a.x < 0) return null;
                return (
                    <div
                        key={`auto-${a.time}`}
                        {...{ [GROUP_MARKER_ATTR]: "" }}
                        onMouseEnter={() => setHoveredAuto(a.time)}
                        onMouseLeave={() => setHoveredAuto((cur) => (cur === a.time ? null : cur))}
                        onClick={() => a.point && onMovePoint(a.point.tradeTime)}
                        onContextMenu={(e) => e.preventDefault()}
                        title={autoLabelOf(a.time)}
                        style={{ ...markerBoxStyle(a.x, 7), cursor: "pointer" }}
                    >
                        <MarkerDiamond active={hoveredAuto === a.time} now={a.time === currentSnapped} />
                    </div>
                );
            })}
            {/* 시간선 ▼ — 타점이 아닌 자리에서만(겹치면 위에서 그 ◇ 가 MARKER_NOW 로 칠해진다). */}
            {overlay.current && !overlay.marks.some((a) => a.time === currentSnapped) && overlay.current.x >= 0 && (
                <div title="현재 시간선" style={{ ...markerBoxStyle(overlay.current.x, 7), pointerEvents: "none" }}>
                    <MarkerTriangle fill={MARKER_NOW} stroke={MARKER_NOW} />
                </div>
            )}
            {/* 타점 hover 카드 — 세로선 우측(공간 없으면 좌측). 축별 상세는 "타점 정보" 패널. */}
            {hoveredCard && hoveredCard.point && hoveredCard.x >= 0 && (
                <AnchoredBox x={hoveredCard.x} top={1} containerWidth={containerWidth} zIndex={10}>
                    <MarkerCard point={hoveredCard.point} />
                </AnchoredBox>
            )}
            {/* 현재 타점(시간선) readout — 토글 ON 시 세로선 우측 한 줄. */}
            {showPointInfo && overlay.current && overlay.current.point && (
                <AnchoredBox x={overlay.current.x} top={1} containerWidth={containerWidth} zIndex={9}>
                    <MarkerCard point={overlay.current.point} />
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
