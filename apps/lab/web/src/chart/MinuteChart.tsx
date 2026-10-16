import { useRef } from "react";
import { CrosshairMode, LineStyle } from "lightweight-charts";
import { kstHHmm } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip, useRafCursor } from "./chartShell.js";
import { FloatingTooltip } from "./tooltip.js";
import { OhlcTooltip } from "./MinuteChartTooltips.js";
import { useMinuteSeries, useMinuteSeriesData, useTimeLine } from "./minuteSeries.js";
import { useFollowMarker, useMinuteVisibleRange } from "./minuteFraming.js";
import { useCandlePrimaryClick } from "./candleInteraction.js";
import type { MinutePoint } from "./derive.js";

// 분봉 차트 — 캔들(등락률 %) pane + 거래대금(억) pane + 시각 세로선 + 크로스헤어 OHLC 툴팁.
// 봉 ctrl(⌘)+클릭 또는 더블클릭 = 그 시각 선택(맨 좌클릭은 팬). 명령형 배선은 minuteSeries·minuteFraming.
export function MinuteChart({
    points,
    frameKey,
    markerTime = null,
    zoom = null,
    showAmountMarkers = true,
    onPickTime,
}: {
    points: MinutePoint[];
    /** 데이터셋 정체성(code:date) — 바뀔 때만 표시범위를 다시 잡는다. */
    frameKey: string;
    /** 시각 세로선(unix초). null = 없음. */
    markerTime?: number | null;
    /** f 줌 — 켜면 anchorTime(unix초, null = 마지막 봉)을 가운데로 bars 봉. null = 세션 기본 뷰. */
    zoom?: { bars: number; anchorTime: number | null } | null;
    showAmountMarkers?: boolean;
    /** 봉 선택 — 그 봉의 시각(HH:MM:SS). */
    onPickTime: (time: string) => void;
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

    const series = useMinuteSeries(chartRef);
    const pointMapRef = useMinuteSeriesData(series, points, showAmountMarkers);
    useTimeLine(series, points, markerTime);
    useMinuteVisibleRange(chartRef, points, frameKey, zoom?.bars ?? null, zoom?.anchorTime ?? null);
    useFollowMarker(chartRef, points, markerTime, frameKey, zoom?.bars ?? null);
    useCandlePrimaryClick<number>({
        chartRef,
        resolveTime: (t) => (typeof t === "number" ? t : null),
        // 실제 봉일 때만(조회 맵이 검증).
        onPrimaryAction: (t) => {
            const p = pointMapRef.current.get(t);
            if (p) onPickTime(p.tradeTime);
        },
    });

    // 툴팁 위치는 크로스헤어 좌표(pane 마다 기준이 다르다) 대신 실제 커서 위치(rAF 스로틀).
    const { cursor, onCursorMove } = useRafCursor();
    const { state: tip } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as number | undefined;
            if (t === undefined) return null;
            const p = pointMapRef.current.get(t);
            if (!p) return null;
            return <OhlcTooltip time={t} open={p.open} high={p.high} low={p.low} close={p.close} amount={p.amount} cumAmount={p.cumAmount} />;
        },
    });

    return (
        <div ref={containerRef} onMouseMove={onCursorMove} style={{ position: "relative", width: "100%", height: "100%" }}>
            {tip.visible && (
                <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>
                    {tip.content}
                </FloatingTooltip>
            )}
        </div>
    );
}
