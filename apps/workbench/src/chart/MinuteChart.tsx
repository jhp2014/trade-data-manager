import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CrosshairMode, LineStyle } from "lightweight-charts";
import { kstHHmm } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip, useRafCursor } from "./chartShell.js";
import { FloatingTooltip } from "./tooltip.js";
import { MarkerCard, OhlcTooltip } from "./MinuteChartTooltips.js";
import { useMinuteSeries, useMinuteSeriesData } from "./minuteSeries.js";
import { useMinuteVisibleRange } from "./minuteFraming.js";
import {
    useMarkerOverlay,
    useMarkerVertLines,
    usePercentPriceLines,
    type SavedPointInput,
} from "./minuteOverlays.js";
import { useMinuteInteraction, GROUP_MARKER_ATTR } from "./minuteInteraction.js";
import type { MinutePoint } from "../lib/derive.js";
import type { RenderLine } from "../lib/chartFrame.js";
import type { Group } from "../api/groups.js";
import { MARKER_NOW } from "../styles/palette.js";

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
 * ▼ 마커 기하 — 저장 타점과 시간선이 **같은 크기·같은 높이**에 서도록 한 곳에서만 정한다.
 * (따로 적었을 땐 시간선 쪽이 축소 뷰박스 + 인라인 svg 베이스라인만큼 작고 낮게 그려졌다.)
 * 호출부가 정하는 건 색(채움/테두리)과 강조 여부뿐.
 */
const MARKER_BOX = { w: 18, h: 14 } as const;

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

function MarkerTriangle({ fill, stroke, active = false }: { fill: string; stroke: string; active?: boolean }): JSX.Element {
    return (
        <svg
            width={12}
            height={10}
            viewBox="0 0 12 10"
            style={{
                display: "block", // 인라인 baseline 만큼 내려앉지 않게
                overflow: "visible",
                pointerEvents: "none",
                filter: active ? "drop-shadow(0 2px 2.5px rgba(0,0,0,0.5))" : "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
                transform: active ? "scale(1.35)" : "none",
                transformOrigin: "50% 50%",
                transition: "transform 0.1s ease, filter 0.1s ease",
            }}
        >
            <polygon points="1,1 11,1 6,9" fill={fill} stroke={stroke} strokeWidth={1.4} />
        </svg>
    );
}

// chart-review 참고 재구현: 캔들(등락률 %) pane + 거래대금(억) histogram pane + 크로스헤어 OHLC 툴팁.
// 데이터는 이미 파생된 MinutePoint[](%/원). 명령형(lightweight-charts) 배선은 minuteSeries(수명주기·
// 데이터)·minuteFraming(표시범위)·minuteOverlays(세로선·가격선·골격)·minuteInteraction(마우스) 훅들이
// 담당하고, 여기는 훅 조합 + 오버레이(타점 ▼·정보 카드)·툴팁 렌더만.

export function MinuteChart({
    points,
    frameKey,
    showAmountMarkers = true,
    lines,
    base,
    pctBase,
    markerTime = null,
    savedPoints = [],
    showPointInfo = false,
    zoom = null,
    lockTimeScale = false,
    onMovePoint,
    onRightClick,
    onRemoveLine,
    onLineContext,
    onPickPrice,
    capturePriceArmed = false,
    groupsOfTime,
}: {
    points: MinutePoint[];
    frameKey: string; // 데이터셋 정체성(code:date) — 이게 바뀔 때만 표시범위 리프레임(라이브 틱엔 뷰 보존).
    showAmountMarkers?: boolean;
    lines: RenderLine[]; // D+M+A 선. % 변환 분모는 종류별(linePct): D=pctBase, M/A=base.
    base: number | null; // % 기준가(당일 원주가) — 캔들·M/A 선·가격 캡처 분모
    pctBase: number | null; // % 기준가(수정주가 전일종가) — D 선 분모
    markerTime?: number | null; // 현재 타점 세로선(unix초). null = 없음.
    savedPoints?: SavedPointInput[]; // 저장된 복기 타점(unix초). 흐린 세로선 + hover 카드.
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
    groupsOfTime?: (tradeTime: string) => Group[]; // 그 시각 타점에 붙은 그룹(카드 아랫줄). 없으면 그룹 줄 없음.
    /** 현재 타점의 분봉 골격 피벗(unix초·raw 가격) — % 변환은 오버레이가 base 로 한다. */
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
    useMinuteVisibleRange(chartRef, points, zoom, frameKey, series.bumpOverlay, lockTimeScale);
    useMinuteInteraction({ chartRef, containerRef, candleRef: series.candleRef, pointMapRef, lines, base, pctBase, onMovePoint, onRightClick, onRemoveLine, onLineContext, onPickPrice, captureArmed: capturePriceArmed });
    usePercentPriceLines(series.candleRef, lines, base, pctBase);

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

    // 오버레이(타점 아이콘·현재 타점 정보) — 저장 타점 각각에 hover 아이콘, 현재 타점엔 토글 정보 박스.
    // hover 손잡이는 **스냅 시각**(s.time) — 배열 인덱스로 잡으면 hover 중 목록이 바뀔 때 옆 타점 카드가 뜬다.
    const [hoveredSaved, setHoveredSaved] = useState<number | null>(null);
    const overlay = useMarkerOverlay(chartRef, series, pointMapRef, savedSnapped, currentSnapped);

    // 오버레이 박스 우/좌 판정용 컨테이너 폭 + 현재 hover 중인 저장 타점.
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const hoveredCard = hoveredSaved != null ? overlay.saved.find((s) => s.time === hoveredSaved) ?? null : null;
    // 현재 시각이 저장 타점과 겹치는가 — 겹치면 그 타점 ▼ 를 검게 칠하고 시간선 ▼ 는 그리지 않는다
    // (같은 자리에 두 마커를 겹쳐 그리면 "검정=현재" 와 "채움=배치" 두 규칙이 한 도형에서 충돌한다).
    const currentSaved = currentSnapped != null ? overlay.saved.find((s) => s.time === currentSnapped) : undefined;

    return (
        <div
            ref={containerRef}
            onMouseMove={onCursorMove}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            {/* 저장 타점 ▼ 마커 — 클릭하면 시간선이 그 타점으로. **색** = 지금 시간선이 여기인가(검정). */}
            {overlay.saved.map((s) => {
                if (s.x < 0) return null;
                const isNow = s.time === currentSnapped;
                const isActive = hoveredSaved === s.time || isNow;
                return (
                    <div
                        key={s.time}
                        {...{ [GROUP_MARKER_ATTR]: "" }}
                        onMouseEnter={() => setHoveredSaved(s.time)}
                        onMouseLeave={() => setHoveredSaved((cur) => (cur === s.time ? null : cur))}
                        onClick={() => s.point && onMovePoint(s.point.tradeTime)}
                        onContextMenu={(e) => e.preventDefault()}
                        title="저장된 타점 (클릭: 이 타점으로)"
                        style={{ ...markerBoxStyle(s.x, 8), cursor: "pointer" }}
                    >
                        <MarkerTriangle
                            active={isActive}
                            fill={isNow ? MARKER_NOW : "var(--bg-primary, #ffffff)"}
                            stroke={isNow ? MARKER_NOW : "rgba(90,90,105,0.95)"}
                        />
                    </div>
                );
            })}
            {/* 시간선 ▼ — 타점이 아닌 자리에 있을 때만(타점과 겹치면 위에서 그 ▼ 가 검게 칠해진다). */}
            {overlay.current && !currentSaved && overlay.current.x >= 0 && (
                <div title="현재 시간선" style={{ ...markerBoxStyle(overlay.current.x, 7), pointerEvents: "none" }}>
                    <MarkerTriangle fill={MARKER_NOW} stroke={MARKER_NOW} />
                </div>
            )}
            {/* 저장 타점 hover 카드 — 세로선 우측(공간 없으면 좌측). 축별 상세는 "타점 정보" 패널. */}
            {hoveredCard && hoveredCard.point && hoveredCard.x >= 0 && (
                <AnchoredBox x={hoveredCard.x} top={1} containerWidth={containerWidth} zIndex={10}>
                    <MarkerCard point={hoveredCard.point} groups={groupsOfTime?.(hoveredCard.point.tradeTime) ?? []} />
                </AnchoredBox>
            )}
            {/* 현재 타점(시간선) readout — 토글 ON 시 세로선 우측 한 줄. */}
            {showPointInfo && overlay.current && overlay.current.point && (
                <AnchoredBox x={overlay.current.x} top={1} containerWidth={containerWidth} zIndex={9}>
                    <MarkerCard point={overlay.current.point} groups={groupsOfTime?.(overlay.current.point.tradeTime) ?? []} />
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
