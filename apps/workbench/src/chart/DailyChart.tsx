import { useEffect, useRef, useState } from "react";
import {
    CandlestickSeries,
    HistogramSeries,
    CrosshairMode,
    LineStyle,
    createSeriesMarkers,
    type IPriceLine,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
} from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR, RISE_FILL, FALL_FILL, AMOUNT_BAR_COLOR, highMarkerColor } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip } from "./chartShell.js";
import { FloatingTooltip } from "./tooltip.js";
import type { DailyPoint } from "../lib/derive.js";
import type { RenderLine } from "../api/priceLines.js";
import { fmtRate, fmtEok } from "../lib/format.js";

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 크로스헤어 세로선 날짜 라벨 — "26년 12월 26일 (금)". time 은 일봉 business-day 문자열이지만
// BusinessDay 객체·UTCTimestamp 도 방어적으로 처리.
function fmtDailyCrosshair(time: Time): string {
    let y: number, mo: number, d: number;
    if (typeof time === "string") {
        [y, mo, d] = time.split("-").map(Number) as [number, number, number];
    } else if (typeof time === "object" && "year" in time) {
        ({ year: y, month: mo, day: d } = time);
    } else {
        const dt = new Date((time as number) * 1000);
        [y, mo, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
    }
    const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    return `${String(y).slice(-2)}년 ${mo}월 ${d}일 (${WEEKDAYS_KO[wd]})`;
}

// 일봉 차트 — 캔들은 raw 가격(분봉과 달리 %가 아님) + 거래대금 pane + 고가 등락률(전일비) 마커.
// 봉 우클릭 = 그 봉 고점에 가격선(D) 토글(자동 저장). chart-review RealDailyChart 참고.
export function DailyChart({ points, lines, onRightClick, onRemoveLine, onCandleClick }: { points: DailyPoint[]; lines: RenderLine[]; onRightClick: (anchorDate: string) => void; onRemoveLine: (line: RenderLine) => void; onCandleClick?: (date: string) => void }): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const mapRef = useRef<Map<string, DailyPoint>>(new Map());
    const hoveredTimeRef = useRef<string | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const linesRef = useRef<RenderLine[]>(lines); // 우클릭 라벨-삭제 매칭용
    linesRef.current = lines;
    const onRightClickRef = useRef(onRightClick);
    const onRemoveLineRef = useRef(onRemoveLine);
    const onCandleClickRef = useRef(onCandleClick);
    useEffect(() => {
        onRightClickRef.current = onRightClick;
        onRemoveLineRef.current = onRemoveLine;
        onCandleClickRef.current = onCandleClick;
    });

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
            lastValueVisible: false,
            priceFormat: { type: "price", precision: 0, minMove: 1 },
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
        chart.priceScale("right", 1).applyOptions({ borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
        const panes = chart.panes();
        panes[0]?.setStretchFactor(3);
        panes[1]?.setStretchFactor(1);
        candleRef.current = candle;
        amountRef.current = amount;
        markersRef.current = createSeriesMarkers(candle);
        return () => {
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const candle = candleRef.current;
        const amount = amountRef.current;
        if (!candle || !amount) return;
        const map = new Map<string, DailyPoint>();
        candle.setData(
            points.map((p) => {
                map.set(p.time, p);
                return { time: p.time as Time, open: p.open, high: p.high, low: p.low, close: p.close };
            }),
        );
        mapRef.current = map;
        amount.setData(points.map((p) => ({ time: p.time as Time, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL })));
        // 고가 등락률(전일비) 마커 — 임계 이상만.
        const markers = [];
        for (const p of points) {
            if (!p.prevClose || p.prevClose <= 0) continue;
            const pct = ((p.high - p.prevClose) / p.prevClose) * 100;
            const color = highMarkerColor(pct);
            if (color) markers.push({ time: p.time as Time, position: "aboveBar" as const, color, shape: "circle" as const, size: 1, text: `${pct.toFixed(1)}` });
        }
        markersRef.current?.setMarkers(markers);
        chartRef.current?.timeScale().fitContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points]);

    // 우클릭 대상 = crosshair 로 hover 중인 봉. contextmenu 시 그 봉 고점으로 토글.
    useEffect(() => {
        const chart = chartRef.current;
        const el = containerRef.current;
        if (!chart || !el) return;
        const onMove = (param: { time?: unknown }): void => {
            hoveredTimeRef.current = typeof param.time === "string" ? param.time : null;
        };
        chart.subscribeCrosshairMove(onMove);
        // 봉 좌클릭 = 그 날짜로 검색 모드(뉴스 조회). param.time 은 일봉 날짜 문자열(빈 영역 클릭이면 undefined).
        const onClick = (param: { time?: unknown }): void => {
            if (typeof param.time === "string") onCandleClickRef.current?.(param.time);
        };
        chart.subscribeClick(onClick);
        const onCtx = (e: MouseEvent): void => {
            e.preventDefault();
            const candle = candleRef.current;
            const y = e.clientY - el.getBoundingClientRect().top;
            // 1) 기존 선(라벨/선) 근처 우클릭 → 그 선 삭제.
            if (candle) {
                for (const line of linesRef.current) {
                    const ly = candle.priceToCoordinate(line.price);
                    if (ly != null && Math.abs((ly as number) - y) <= 6) {
                        onRemoveLineRef.current(line);
                        return;
                    }
                }
            }
            // 2) 아니면 hover 봉에 D 선 추가 — 그 봉의 날짜(앵커). 값은 표시 시점 고가에서 읽음.
            const t = hoveredTimeRef.current;
            const p = t ? mapRef.current.get(t) : null;
            if (p) onRightClickRef.current(p.time);
        };
        el.addEventListener("contextmenu", onCtx);
        return () => {
            chart.unsubscribeCrosshairMove(onMove);
            chart.unsubscribeClick(onClick);
            el.removeEventListener("contextmenu", onCtx);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 가격선(D) 렌더 — raw 가격에 수평선.
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
        priceLinesRef.current = lines.map((line) =>
            candle.createPriceLine({ price: line.price, color: "#16796f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: line.kind }),
        );
    }, [lines]);

    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const { state: tip } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as string | undefined;
            if (t === undefined) return null;
            const p = mapRef.current.get(t);
            if (!p) return null;
            const rate = p.prevClose && p.prevClose > 0 ? ((p.close - p.prevClose) / p.prevClose) * 100 : null;
            const highPct = p.prevClose && p.prevClose > 0 ? ((p.high - p.prevClose) / p.prevClose) * 100 : null;
            return (
                <div>
                    <div style={{ fontSize: 11, color: "#a0a0a0", marginBottom: 6 }}>{p.time}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                        <div style={{ color: "#a0a0a0" }}>종가</div>
                        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.close.toLocaleString()}{rate != null && <span style={{ color: rate >= 0 ? RISE_COLOR : FALL_COLOR, marginLeft: 6 }}>{fmtRate(rate)}</span>}</div>
                        <div style={{ color: "#a0a0a0" }}>고가</div>
                        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.high.toLocaleString()}{highPct != null && <span style={{ color: "#d4d4d8", marginLeft: 6 }}>{fmtRate(highPct)}</span>}</div>
                        <div style={{ color: "#a0a0a0" }}>거래대금</div>
                        <div style={{ textAlign: "right", color: "#d4d4d8", fontVariantNumeric: "tabular-nums" }}>{fmtEok(p.amount)}</div>
                    </div>
                </div>
            );
        },
    });

    return (
        <div
            ref={containerRef}
            onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
            }}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            {tip.visible && <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>{tip.content}</FloatingTooltip>}
        </div>
    );
}
