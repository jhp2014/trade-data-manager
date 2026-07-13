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
    type UTCTimestamp,
} from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR, RISE_FILL, FALL_FILL, AMOUNT_BAR_COLOR, highMarkerColor } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip } from "./chartShell.js";
import { VertLines, asPrimitive } from "./vertLine.js";
import { FloatingTooltip } from "./tooltip.js";
import type { DailyPoint } from "../lib/derive.js";
import type { RenderLine } from "../api/priceLines.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import { fmtDateKo } from "../lib/date.js";

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const LEFT_MARGIN_BARS = 3; // 좌측 여백(빈 논리 인덱스)
const RIGHT_MARGIN_BARS = 10; // 우측 여백 — 가격선 라벨(D/M)이 오늘 봉을 가리지 않게

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
// pctBase(검색일 전일종가)가 있으면 크로스헤어 y-위치를 % 로 툴팁에 표시 + showGuide 시 +30%(상한가) 가이드선.
export function DailyChart({ points, lines, zoom = false, zoomBars = 60, zoomOutBars = 250, onRightClick, onRemoveLine, onCandleClick, searchDate, pctBase, showGuide = false }: { points: DailyPoint[]; lines: RenderLine[]; zoom?: boolean; zoomBars?: number; zoomOutBars?: number; onRightClick: (anchorDate: string) => void; onRemoveLine: (line: RenderLine) => void; onCandleClick?: (date: string) => void; searchDate?: string; pctBase?: number | null; showGuide?: boolean }): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const mapRef = useRef<Map<string, DailyPoint>>(new Map());
    const hoveredTimeRef = useRef<string | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const vertRef = useRef<VertLines | null>(null); // 검색날짜 세로선
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
        const vert = new VertLines([]);
        candle.attachPrimitive(asPrimitive(vert));
        vertRef.current = vert;
        return () => {
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
            vertRef.current = null;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points]);

    // 표시 범위 — f 줌인=최근 zoomBars 봉 / 축소=최근 zoomOutBars 봉(~1년, 데이터 적으면 전체).
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        const n = points.length;
        // 좌측에 여백(빈 논리 인덱스, 음수 from 도 허용) + 우측에 여백(오늘 봉이 축에 바짝 붙으면
        // 가격선 라벨(D/M, priceLine title)이 오늘 봉을 가림 → 우측도 넉넉히 띄운다.
        const from = Math.max(0, n - (zoom ? zoomBars : zoomOutBars)) - LEFT_MARGIN_BARS;
        chart.timeScale().setVisibleLogicalRange({ from, to: n + RIGHT_MARGIN_BARS });
    }, [points, zoom, zoomBars, zoomOutBars]);

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

    // 검색날짜 세로선(실시간 차트 탐색) — 지정일에 앰버 파선. 기준일=검색날짜면 없음.
    useEffect(() => {
        vertRef.current?.setLines(searchDate ? [{ time: searchDate as unknown as UTCTimestamp, color: "#e07b1a", width: 1, dashed: true }] : []);
    }, [searchDate]);

    // +30% 가이드 가로선 — 검색일 전일종가 ×1.3(= 그 세션 상한가 위치). 색은 고가마커 30%+ 와 동일(보라).
    const guideLineRef = useRef<IPriceLine | null>(null);
    useEffect(() => {
        const candle = candleRef.current;
        if (!candle) return;
        if (guideLineRef.current) {
            try {
                candle.removePriceLine(guideLineRef.current);
            } catch {
                /* noop */
            }
            guideLineRef.current = null;
        }
        if (showGuide && pctBase != null && pctBase > 0) {
            guideLineRef.current = candle.createPriceLine({ price: pctBase * 1.3, color: "#7c3aed", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "+30%" });
        }
    }, [pctBase, showGuide]);

    // 검색날짜 세로선 x 좌표 추적(pan/zoom·searchDate 변경) → HTML 날짜 배지 위치(분봉 마커 카드 스타일).
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const ts = chart.timeScale();
        const update = (): void => {
            const c = searchDate ? ts.timeToCoordinate(searchDate as unknown as Time) : null;
            setLineX(c == null ? null : (c as number));
        };
        update();
        ts.subscribeVisibleLogicalRangeChange(update);
        return () => ts.unsubscribeVisibleLogicalRangeChange(update);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchDate]);

    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const [lineX, setLineX] = useState<number | null>(null); // 검색날짜 세로선 x(HTML 배지 위치)
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
            // 크로스헤어 y-위치(가로선) → 검색일 전일종가(pctBase) 대비 %. 캔들 pane(0)에서만 — 거래대금 pane 제외.
            const cursorPrice = (param.paneIndex ?? 0) === 0 && param.point ? candleRef.current?.coordinateToPrice(param.point.y) : null;
            const cursorPct = cursorPrice != null && pctBase != null && pctBase > 0 ? ((cursorPrice - pctBase) / pctBase) * 100 : null;
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
                        {cursorPct != null && cursorPrice != null && (
                            <>
                                <div style={{ color: "#a0a0a0" }}>위치</div>
                                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(cursorPrice).toLocaleString()}<span style={{ color: cursorPct >= 0 ? RISE_COLOR : FALL_COLOR, marginLeft: 6 }}>{fmtRate(cursorPct)}</span></div>
                            </>
                        )}
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
            {lineX != null && searchDate && (
                <div
                    className="tabular"
                    style={{
                        position: "absolute",
                        top: 4,
                        left: lineX,
                        zIndex: 6,
                        pointerEvents: "none",
                        transform: containerRef.current && lineX > containerRef.current.clientWidth * 0.72 ? "translateX(calc(-100% - 6px))" : "translateX(6px)",
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 4,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        padding: "1px 7px",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        color: "#e07b1a",
                    }}
                >
                    {fmtDateKo(searchDate)}
                </div>
            )}
            {tip.visible && <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>{tip.content}</FloatingTooltip>}
        </div>
    );
}
