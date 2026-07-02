import { useEffect, useRef } from "react";
import {
    CandlestickSeries,
    HistogramSeries,
    CrosshairMode,
    LineStyle,
    type AutoscaleInfo,
    type ISeriesApi,
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
} from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip } from "./chartShell.js";
import type { MinutePoint } from "../lib/derive.js";
import { fmtRate, fmtEok } from "../lib/format.js";

// chart-review 참고 재구현: 캔들(등락률 %) pane + 거래대금(억) histogram pane + 크로스헤어 OHLC 툴팁.
// 데이터는 이미 파생된 MinutePoint[](%/원). 여기선 시리즈 렌더·툴팁만 담당.
export function MinuteChart({ points }: { points: MinutePoint[] }): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const cumMapRef = useRef<Map<number, number>>(new Map());

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
        return () => {
            candleRef.current = null;
            amountRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        const bars: Array<{ time: Time; value: number; color: string }> = [];
        for (const p of points) {
            amountMap.set(p.time, p.amount);
            cumMap.set(p.time, p.cumAmount);
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
        amount.setData(bars);
        chartRef.current?.timeScale().fitContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points]);

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

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <FloatingTooltip visible={tip.visible} x={tip.x} y={tip.y} containerRef={containerRef}>
                {tip.content}
            </FloatingTooltip>
        </div>
    );
}

// ── 툴팁 ────────────────────────────────────────────────────────────────
function rateColor(v: number): string {
    if (v > 0) return RISE_COLOR;
    if (v < 0) return FALL_COLOR;
    return "#a0a0a0";
}

function OhlcTooltip({
    time,
    open,
    high,
    low,
    close,
    amount,
    cumAmount,
}: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    amount: number;
    cumAmount: number;
}): JSX.Element {
    const swing = close >= open ? high - low : -(high - low);
    const cell = (label: string, value: number) => (
        <>
            <div style={{ color: "#a0a0a0" }}>{label}</div>
            <div style={{ textAlign: "right", color: rateColor(value), fontVariantNumeric: "tabular-nums" }}>
                {fmtRate(value)}
            </div>
        </>
    );
    return (
        <>
            <div style={{ fontSize: 11, color: "#a0a0a0", marginBottom: 6 }}>{kstHHmm(time)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                {cell("현재", close)}
                {cell("고가", high)}
                {cell("저가", low)}
                {cell("변동폭", swing)}
                <div style={{ color: "#a0a0a0" }}>거래대금</div>
                <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>{fmtEok(amount)}</div>
                <div style={{ color: "#a0a0a0" }}>누적</div>
                <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>{fmtEok(cumAmount)}</div>
            </div>
        </>
    );
}

function FloatingTooltip({
    visible,
    x,
    y,
    containerRef,
    children,
}: {
    visible: boolean;
    x: number;
    y: number;
    containerRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}): JSX.Element | null {
    if (!visible) return null;
    const cw = containerRef.current?.clientWidth ?? 0;
    // 커서 오른쪽에 두되 오른쪽 가장자리면 왼쪽으로 뒤집는다.
    const flip = x > cw - 200;
    const style: React.CSSProperties = {
        position: "absolute",
        top: Math.max(8, y - 12),
        left: flip ? undefined : x + 16,
        right: flip ? cw - x + 16 : undefined,
        pointerEvents: "none",
        background: "rgba(20,20,24,0.95)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 6,
        padding: "10px 12px",
        zIndex: 10,
        minWidth: 150,
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    };
    return <div style={style}>{children}</div>;
}
