import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type MouseEventParams, type Time } from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR } from "./chartUtils.js";
import { barIndexAt, baseChartOptions, centerOnIndex, useChartShell, useCrosshairTooltip, useRafCursor } from "./chartShell.js";
import { useDailySeries, useDailySeriesData, useDailyVisibleRange } from "./dailyChartHooks.js";
import { useCandlePrimaryClick } from "./candleInteraction.js";
import { LineMarkLayer, type LineMark } from "./lineMarks.js";
import type { ChipChannel } from "./lineSets.js";
import { lineColorOf, usePriceLevels } from "./priceLevels.js";
import { useLoadOlderAtLeftEdge } from "./olderData.js";
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

/** 차트에 그을 일봉 선(임시·저장) — 점선 가격선(축 라벨은 가격만) + 상단 표식 칩. 위/아래는 그리지 않는다(DESIGN 9절 「일봉 선」). */
export type ChartLine = LineMark;

// 일봉 차트 — 캔들(원화) + 거래대금 pane + 고가 등락률(전일비) 마커 + 크로스헤어 툴팁 + 일봉 선.
// 봉 ctrl(⌘)+클릭 또는 더블클릭 = 그 날짜 선택(맨 좌클릭은 팬) · 우클릭 = 그 봉에 선(onLinePick — 어느 값인지는 호출자 설정).
// 첫 봉을 넘어 왼쪽으로 끌면 onNeedOlder — 앞 덩이가 붙어도 화면은 제자리(lightweight-charts 몫).
export function DailyChart({
    points,
    frameKey,
    visibleBars = 250,
    onPickDate,
    lines = [],
    onLinePick,
    onChipToggle,
    onNeedOlder,
    pctBase = null,
}: {
    points: DailyPoint[];
    /** 데이터셋 정체성 — 바뀔 때만 표시범위를 다시 잡는다. */
    frameKey: string;
    /** 처음 보이는 최근 봉 수(~1년). */
    visibleBars?: number;
    onPickDate: (date: string) => void;
    lines?: readonly ChartLine[];
    /** 우클릭한 봉의 날짜(브라우저 메뉴는 막는다). */
    onLinePick?: (date: string) => void;
    /** 칩 점 클릭 — 그 채널(토큰·저장)을 켜고 끈다. */
    onChipToggle?: (mark: LineMark, channel: ChipChannel) => void;
    /** 왼쪽 끝에 닿았다 — 더 앞 일봉을 받을 때(받는 중 중복은 호출자가 막는다). */
    onNeedOlder?: () => void;
    /** 전날 종가(차트 모드) — 십자선 가격 라벨 옆에 이 값 대비 % 를 띄운다(선의 축 옆 % 와 같은 기준). 없으면 안 띄운다. */
    pctBase?: number | null;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useChartShell(containerRef, () => ({
        ...baseChartOptions(),
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dotted, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dotted, labelVisible: true },
        },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.08 } }, // top 은 LineMarkLayer 가 칩 띠(px)만큼 다시 건다
        leftPriceScale: { visible: false },
        timeScale: { borderVisible: false, barSpacing: 3, rightOffset: 6 },
        localization: { locale: "ko-KR", timeFormatter: fmtDailyCrosshair },
    }));

    const series = useDailySeries(chartRef);
    const mapRef = useDailySeriesData(series, points);
    useDailyVisibleRange(chartRef, points, frameKey, visibleBars);
    useLoadOlderAtLeftEdge(chartRef, onNeedOlder);
    useCandlePrimaryClick<string>({
        chartRef,
        resolveTime: (t) => (typeof t === "string" ? t : null),
        onPrimaryAction: onPickDate,
    });

    usePriceLevels(series.candleRef, series.gen, useMemo(() => lines.map((l) => ({ key: l.key, value: l.price, color: lineColorOf(l.kind), title: l.note })), [lines]));
    // 우클릭 = 커서 아래 봉 — 논리 인덱스로 고른다(그림 상자 밖 = 가격 축 위·빈칸·여백이면 무시).
    const onContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (!onLinePick) return;
        e.preventDefault();
        const i = barIndexAt(chartRef.current, e.clientX - e.currentTarget.getBoundingClientRect().left, points.length);
        if (i !== null) onLinePick(points[i].time);
    };
    // ◀▶ 칩 — 그 봉을 가운데로(보이는 폭은 그대로).
    const goTo = (time: string | number): void => centerOnIndex(chartRef.current, points.findIndex((p) => p.time === time));

    const crossPct = useCrossPct(chartRef, series.candleRef, series.gen, pctBase);

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
        <div ref={containerRef} onMouseMove={onCursorMove} onContextMenu={onContextMenu} style={{ position: "relative", width: "100%", height: "100%" }}>
            <LineMarkLayer chartRef={chartRef} candleRef={series.candleRef} marks={lines} gen={series.gen} dataKey={points} onGoTo={goTo} onToggle={(m, ch) => onChipToggle?.(m, ch)} />
            {tip.visible && <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>{tip.content}</FloatingTooltip>}
            {crossPct && (
                <div
                    data-layer="cross-pct"
                    className="tabular"
                    style={{
                        position: "absolute", right: crossPct.right + 3, top: crossPct.y - 8, height: 16, lineHeight: "16px", padding: "0 4px",
                        fontSize: 11, fontWeight: 600, borderRadius: 2, pointerEvents: "none", zIndex: 5, whiteSpace: "nowrap",
                        background: "rgba(60,60,60,0.85)", color: "#fff",
                    }}
                >
                    {`${crossPct.pct > 0 ? "+" : ""}${crossPct.pct.toFixed(1)}%`}
                </div>
            )}
        </div>
    );
}

/**
 * 십자선 가로선의 % — 커서 높이의 가격을 전날 종가 대비로. 가격 축 라벨 바로 왼쪽에 붙인다(선의 축 옆 % 와 같은 자리·같은 기준).
 * 캔들 pane 밖(거래대금 pane)이거나 기준이 없으면 없다.
 */
function useCrossPct(
    chartRef: RefObject<IChartApi | null>,
    candleRef: RefObject<ISeriesApi<"Candlestick"> | null>,
    gen: number,
    base: number | null,
): { y: number; right: number; pct: number } | null {
    const [v, setV] = useState<{ y: number; right: number; pct: number } | null>(null);
    useEffect(() => {
        const chart = chartRef.current;
        const candle = candleRef.current;
        setV(null);
        if (!chart || !candle || !base) return;
        const on = (p: MouseEventParams): void => {
            const paneH = chart.panes()[0]?.getHeight() ?? Infinity;
            const price = p.point && p.point.y <= paneH ? candle.coordinateToPrice(p.point.y) : null;
            if (!p.point || price === null) return setV(null);
            setV({ y: p.point.y, right: chart.priceScale("right").width(), pct: ((price - base) / base) * 100 });
        };
        chart.subscribeCrosshairMove(on);
        return () => chart.unsubscribeCrosshairMove(on);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gen, base]);
    return v;
}
