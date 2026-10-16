import { useRef } from "react";
import { CrosshairMode, LineStyle, type Time } from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip, useRafCursor } from "./chartShell.js";
import { useDailySeries, useDailySeriesData, useDailyVisibleRange } from "./dailyChartHooks.js";
import { useCandlePrimaryClick } from "./candleInteraction.js";
import { FloatingTooltip } from "./tooltip.js";
import type { DailyPoint } from "./derive.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import { CHART_LABEL, CHART_VALUE } from "./palette.js";
import { weekdayKo } from "../lib/date.js";

// 크로스헤어 날짜 라벨 — "26년 7월 31일 (금)". 일봉 time 은 business-day 문자열.
function fmtDailyCrosshair(time: Time): string {
    if (typeof time !== "string") return String(time);
    const [y, mo, d] = time.split("-").map(Number);
    return `${String(y).slice(-2)}년 ${mo}월 ${d}일 (${weekdayKo(time)})`;
}

// 일봉 차트 — 캔들(원화) + 거래대금 pane + 고가 등락률(전일비) 마커 + 크로스헤어 툴팁.
// 봉 ctrl(⌘)+클릭 또는 더블클릭 = 그 날짜 선택(맨 좌클릭은 팬).
export function DailyChart({
    points,
    frameKey,
    visibleBars = 250,
    onPickDate,
}: {
    points: DailyPoint[];
    /** 데이터셋 정체성 — 바뀔 때만 표시범위를 다시 잡는다. */
    frameKey: string;
    /** 처음 보이는 최근 봉 수(~1년). */
    visibleBars?: number;
    onPickDate: (date: string) => void;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useChartShell(containerRef, () => ({
        ...baseChartOptions(),
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dotted, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dotted, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.08 } },
        leftPriceScale: { visible: false },
        timeScale: { borderVisible: false, barSpacing: 3, rightOffset: 6 },
        localization: { locale: "ko-KR", timeFormatter: fmtDailyCrosshair },
    }));

    const series = useDailySeries(chartRef);
    const mapRef = useDailySeriesData(series, points);
    useDailyVisibleRange(chartRef, points, frameKey, visibleBars);
    useCandlePrimaryClick<string>({
        chartRef,
        resolveTime: (t) => (typeof t === "string" ? t : null),
        onPrimaryAction: onPickDate,
    });

    const { cursor, onCursorMove } = useRafCursor();
    const { state: tip } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as string | undefined;
            if (t === undefined) return null;
            const p = mapRef.current.get(t);
            if (!p) return null;
            const rate = p.prevClose && p.prevClose > 0 ? ((p.close - p.prevClose) / p.prevClose) * 100 : null;
            return (
                <div>
                    <div style={{ fontSize: 11, color: CHART_LABEL, marginBottom: 6 }}>{p.time}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                        <div style={{ color: CHART_LABEL }}>종가</div>
                        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.close.toLocaleString()}{rate != null && <span style={{ color: rate >= 0 ? RISE_COLOR : FALL_COLOR, marginLeft: 6 }}>{fmtRate(rate)}</span>}</div>
                        <div style={{ color: CHART_LABEL }}>고가</div>
                        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.high.toLocaleString()}{p.highPct != null && <span style={{ color: CHART_VALUE, marginLeft: 6 }}>{fmtRate(p.highPct)}</span>}</div>
                        <div style={{ color: CHART_LABEL }}>거래대금</div>
                        <div style={{ textAlign: "right", color: CHART_VALUE, fontVariantNumeric: "tabular-nums" }}>{fmtEok(p.amount)}</div>
                    </div>
                </div>
            );
        },
    });

    return (
        <div ref={containerRef} onMouseMove={onCursorMove} style={{ position: "relative", width: "100%", height: "100%" }}>
            {tip.visible && <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>{tip.content}</FloatingTooltip>}
        </div>
    );
}
