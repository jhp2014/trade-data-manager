import { useRef } from "react";
import { CrosshairMode, LineStyle, type Time } from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR } from "./chartUtils.js";
import { baseChartOptions, useChartShell, useCrosshairTooltip, useRafCursor } from "./chartShell.js";
import {
    useDailyInteraction,
    useDailyPriceLines,
    useDailySeries,
    useDailySeriesData,
    useDailyVisibleRange,
    useGuideLine,
    useSearchDateLine,
    useSkeletonOverlay,
} from "./dailyChartHooks.js";
import { FloatingTooltip } from "./tooltip.js";
import type { DailyPoint } from "../lib/derive.js";
import type { RenderLine } from "../lib/chartFrame.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import { fmtDateKo } from "../lib/date.js";
import { CHART_LABEL, CHART_VALUE, DRIFT } from "../styles/palette.js";

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
// (골격 미지정의 안정 참조는 오버레이 훅 기본값 — skeletonPath EMPTY_SKELETON — 이 담당한다.)

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

export interface DailyChartProps {
    points: DailyPoint[];
    /** 리프레임 게이트 — 도착한 데이터에서 파생(값이 바뀔 때만 표시범위를 다시 잡는다). */
    frameKey: string;
    lines: RenderLine[];
    zoom?: boolean;
    zoomBars?: number;
    zoomOutBars?: number;
    onRightClick: (anchorDate: string, at: { x: number; y: number }) => void;
    onRemoveLine: (line: RenderLine) => void;
    /** 있으면 선 근처 우클릭 = 메뉴(복기), 없으면 즉시 삭제(실시간). */
    onLineContext?: (line: RenderLine, at: { x: number; y: number }) => void;
    onCandleClick?: (date: string) => void;
    onPickPrice?: (price: number) => void;
    /** 가격 조건 편집 중 — 좌클릭이 날짜검색 대신 가격 캡처가 된다. */
    capturePriceArmed?: boolean;
    searchDate?: string;
    /** 검색일 전일종가 — 크로스헤어 위치 %·+30% 가이드선의 분모. */
    pctBase?: number | null;
    showGuide?: boolean;
    /** 이 차트가 무시 캔들로 지목한 거래일 — 봉 위 마커에 함께 적힌다. 값이 아니라 "안 본다"는 뜻이라 선이 아니다. */
    ignoredDates?: readonly string[];
    /** 골격 피벗(날짜·가격) — 이어서 꺾인 선으로 그린다. 형태 분류의 입력을 눈으로 확인하는 용도. */
    skeleton?: readonly { date: string; price: number }[];
    showSkeleton?: boolean;
}

// 일봉 차트 — 캔들은 raw 가격(분봉과 달리 %가 아님) + 거래대금 pane + 고가 등락률(전일비) 마커.
// 봉 ctrl+클릭 또는 더블클릭 = 그 날짜로 검색(맨 좌클릭은 팬 몫). 봉 우클릭 = 그 봉 고점에 가격선(D) 토글.
// 명령형 차트 배선은 dailyChartHooks 로 분리 — 여긴 훅 조합 + 툴팁·날짜배지 렌더만.
export function DailyChart({
    points,
    frameKey,
    lines,
    zoom = false,
    zoomBars = 60,
    zoomOutBars = 250,
    onRightClick,
    onRemoveLine,
    onLineContext,
    onCandleClick,
    onPickPrice,
    capturePriceArmed = false,
    searchDate,
    pctBase,
    showGuide = false,
    ignoredDates,
    skeleton,
    showSkeleton = true,
}: DailyChartProps): JSX.Element {
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
    const mapRef = useDailySeriesData(series, points, ignoredDates);
    useDailyVisibleRange(chartRef, points, frameKey, zoom, zoomBars, zoomOutBars);
    useDailyInteraction({ chartRef, containerRef, series, mapRef, lines, onRightClick, onRemoveLine, onLineContext, onCandleClick, onPickPrice, captureArmed: capturePriceArmed });
    useDailyPriceLines(series, lines);
    useSkeletonOverlay(series, skeleton, showSkeleton);
    useGuideLine(series, pctBase, showGuide);
    const lineX = useSearchDateLine(chartRef, series, searchDate);

    // 툴팁 위치는 실제 커서 위치(rAF 스로틀 — 프레임당 1회, mousemove 마다 리렌더하지 않는다).
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
            const highPct = p.prevClose && p.prevClose > 0 ? ((p.high - p.prevClose) / p.prevClose) * 100 : null;
            // 크로스헤어 y-위치(가로선) → 검색일 전일종가(pctBase) 대비 %. 캔들 pane(0)에서만 — 거래대금 pane 제외.
            const cursorPrice = (param.paneIndex ?? 0) === 0 && param.point ? series.candleRef.current?.coordinateToPrice(param.point.y) : null;
            const cursorPct = cursorPrice != null && pctBase != null && pctBase > 0 ? ((cursorPrice - pctBase) / pctBase) * 100 : null;
            return (
                <div>
                    <div style={{ fontSize: 11, color: CHART_LABEL, marginBottom: 6 }}>{p.time}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                        <div style={{ color: CHART_LABEL }}>종가</div>
                        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.close.toLocaleString()}{rate != null && <span style={{ color: rate >= 0 ? RISE_COLOR : FALL_COLOR, marginLeft: 6 }}>{fmtRate(rate)}</span>}</div>
                        <div style={{ color: CHART_LABEL }}>고가</div>
                        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.high.toLocaleString()}{highPct != null && <span style={{ color: CHART_VALUE, marginLeft: 6 }}>{fmtRate(highPct)}</span>}</div>
                        <div style={{ color: CHART_LABEL }}>거래대금</div>
                        <div style={{ textAlign: "right", color: CHART_VALUE, fontVariantNumeric: "tabular-nums" }}>{fmtEok(p.amount)}</div>
                        {cursorPct != null && cursorPrice != null && (
                            <>
                                <div style={{ color: CHART_LABEL }}>위치</div>
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
            onMouseMove={onCursorMove}
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
                        // 오른쪽 끝에 가까우면 배지를 선 왼쪽으로 뒤집어 잘리지 않게.
                        transform: containerRef.current && lineX > containerRef.current.clientWidth * 0.72 ? "translateX(calc(-100% - 6px))" : "translateX(6px)",
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 4,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        padding: "1px 7px",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        color: DRIFT,
                    }}
                >
                    {fmtDateKo(searchDate)}
                </div>
            )}
            {tip.visible && <FloatingTooltip x={cursor.x} y={cursor.y} containerRef={containerRef}>{tip.content}</FloatingTooltip>}
        </div>
    );
}
