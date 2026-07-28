import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CandlestickSeries, CrosshairMode, LineSeries, LineStyle, createSeriesMarkers, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import { baseChartOptions, useChartShell, useCrosshairTooltip } from "../chart/chartShell.js";
import { RISE_COLOR, FALL_COLOR, AMOUNT_BUCKET_COLORS } from "../chart/chartUtils.js";
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { RankHeatmap, asHeatPrimitive, type HeatModel } from "./rank/rankHeatmapPrimitive.js";
import type { RankPointPath } from "../api/rankPaths.js";
import { FAIL, STRONG } from "../styles/palette.js";

// 분석 히트맵(lightweight-charts) — 밀도 구름 primitive + 네이티브 줌/팬/교차선.
//  · 시간축 = 진입 대비 경과분(합성 unix초 BASE+t*60), 라벨 "N분/진입". 우측 %축 = 진입 정규화(투명 앵커+autoscale 고정).
//  · 목표/손절/horizon 선은 primitive 가 표시만 하고, 조작은 축 여백의 드래그 핸들(플롯 밖이라 팬과 안 부딪힘).
//  · 선택 종목 오버레이 = 캔들차트(구름 위 또렷) + 좌측축 = 그 종목 실%(어파인 범위라 misalign 없음). 툴팁=실시각·실%·분봉/누적 거래대금.

const BASE = 1_000_000_000;
const ROWS = 48;
const OVERLAY = "#8b5cf6"; // 선택 종목 이름 강조 — 보라
const GREEN = STRONG;
const RED = FAIL;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const eok = (won: number): string => `${(won / 1e8).toFixed(won >= 1e10 ? 0 : 1)}억`;

/** 선택 종목 오버레이 — 포커스 종목 캔들(실% OHLC) + 분봉/누적 거래대금(툴팁). 패널이 차트에서 파생. */
export interface HeatOverlay {
    name: string;
    k: number; // 어파인 기울기 = 1 + 진입 실%/100 (실% = k·정규화% + 100(k−1))
    entryMin: number; // 진입 clock 분(minute-of-day) — 툴팁 실시각
    pts: { t: number; open: number; high: number; low: number; close: number; amount: number; cumAmount: number }[]; // 실%(전일종가 대비) OHLC + 거래대금(원)
}

function buildModel(paths: RankPointPath[], dataMinT: number, dataMaxT: number, bucket: number, horizon: number, target: number, stop: number): HeatModel {
    const tMin = Math.min(0, dataMinT);
    const tMax = Math.max(1, dataMaxT);
    const cols = Math.floor((tMax - tMin) / bucket) + 1;
    let yLo = -1, yHi = 1;
    for (const p of paths) for (const b of p.bars) { if (b.low < yLo) yLo = b.low; if (b.high > yHi) yHi = b.high; }
    yLo = Math.floor(yLo - 0.5); yHi = Math.ceil(yHi + 0.5);
    const grid: number[][] = Array.from({ length: cols }, () => new Array(ROWS).fill(0));
    let max = 0;
    const rowOf = (v: number): number => clamp(Math.floor((v - yLo) / (yHi - yLo) * ROWS), 0, ROWS - 1);
    for (const p of paths) for (const b of p.bars) {
        const c = clamp(Math.floor((b.t - tMin) / bucket), 0, cols - 1);
        const r0 = rowOf(b.low), r1 = rowOf(b.high);
        for (let r = r0; r <= r1; r++) { grid[c][r]++; if (grid[c][r] > max) max = grid[c][r]; }
    }
    const colTimes = Array.from({ length: cols }, (_, c) => (BASE + (tMin + c * bucket) * 60) as UTCTimestamp);
    return {
        colTimes, grid, max: max || 1, rows: ROWS, yLo, yHi,
        entryTime: BASE as UTCTimestamp,
        horizonTime: (BASE + Math.min(horizon, dataMaxT) * 60) as UTCTimestamp,
        target, stop,
    };
}

const fmtElapsed = (t: number): string => { const m = Math.round((t - BASE) / 60); return m === 0 ? "진입" : `${m}분`; };
const fmtClock = (min: number): string => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

export function RankHeatmapChart({ paths, horizon, dataMinT, dataMaxT, bucket, setHorizon, target, stop, setTarget, setStop, overlay, heatOn, showAmtMarkers, height = 300 }: {
    paths: RankPointPath[]; horizon: number; dataMinT: number; dataMaxT: number; bucket: number; setHorizon: (m: number) => void;
    target: number; stop: number; setTarget: (v: number) => void; setStop: (v: number) => void;
    overlay: HeatOverlay | null; heatOn: boolean; showAmtMarkers: boolean; height?: number;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useChartShell(containerRef, () => ({
        ...baseChartOptions(),
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.06 } },
        leftPriceScale: { visible: false, borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.06 } },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dashed, labelVisible: true },
            horzLine: { width: 1, color: "rgba(60,60,60,0.4)", style: LineStyle.Dashed, labelVisible: true },
        },
        timeScale: { borderVisible: false, rightOffset: 2, tickMarkFormatter: (t: number) => fmtElapsed(t) },
        localization: { timeFormatter: (t: number) => fmtElapsed(t) },
    }));
    const seriesRef = useRef<ISeriesApi<"Line"> | null>(null); // 앵커(우측, 정규화 %)
    const overlayRef = useRef<ISeriesApi<"Candlestick"> | null>(null); // 선택 종목 캔들(좌측, 실 %)
    const amountMapRef = useRef(new Map<number, { amount: number; cumAmount: number }>()); // time → 분봉/누적 거래대금(툴팁)
    const primRef = useRef<RankHeatmap | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null); // 선택 종목 봉 위 거래대금 마커
    const yRangeRef = useRef({ lo: -1, hi: 1 });
    const overlayRangeRef = useRef({ lo: -1, hi: 1 });
    const tRef = useRef<HTMLDivElement>(null);
    const sRef = useRef<HTMLDivElement>(null);
    const hRef = useRef<HTMLDivElement>(null);
    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const tipRef = useRef<HTMLDivElement>(null);
    const [tipPos, setTipPos] = useState({ left: 0, top: 0 });
    const clampDirRef = useRef(0); // horizon 핸들이 보이는 범위 밖으로 클램프된 방향(−1 좌 / 0 안 / 1 우) — 바뀔 때만 setState.
    const [clampDir, setClampDir] = useState(0);

    const model = useMemo(() => buildModel(paths, dataMinT, dataMaxT, bucket, horizon, target, stop), [paths, dataMinT, dataMaxT, bucket, horizon, target, stop]);

    // 앵커+오버레이 시리즈 + primitive — 마운트 1회. 핸들 위치는 primitive.onLayout 이 매 프레임 명령형 갱신.
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const anchor = chart.addSeries(LineSeries, {
            color: "rgba(0,0,0,0)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
            priceScaleId: "right",
            priceFormat: { type: "custom", formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`, minMove: 0.1 },
            autoscaleInfoProvider: () => ({ priceRange: { minValue: yRangeRef.current.lo, maxValue: yRangeRef.current.hi } }),
        });
        seriesRef.current = anchor;
        const ov = chart.addSeries(CandlestickSeries, {
            upColor: RISE_COLOR, downColor: FALL_COLOR, borderUpColor: RISE_COLOR, borderDownColor: FALL_COLOR, wickUpColor: RISE_COLOR, wickDownColor: FALL_COLOR,
            lastValueVisible: false, priceLineVisible: false,
            priceScaleId: "left",
            priceFormat: { type: "custom", formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`, minMove: 0.1 },
            autoscaleInfoProvider: () => ({ priceRange: { minValue: overlayRangeRef.current.lo, maxValue: overlayRangeRef.current.hi } }),
        });
        overlayRef.current = ov;
        markersRef.current = createSeriesMarkers(ov);
        const prim = new RankHeatmap();
        prim.setSeries(anchor);
        prim.onLayout = (c) => {
            const leftW = chart.priceScale("left").width(); // 좌측축(오버레이 시) 폭 — pane 이 그만큼 우측으로 밀리므로 x 보정
            const put = (el: HTMLDivElement | null, coord: number | null, axis: "top" | "left", off = 0): void => {
                if (!el) return;
                if (coord == null) { el.style.display = "none"; return; }
                el.style.display = "flex";
                el.style[axis] = `${coord + off}px`;
            };
            put(tRef.current, c.targetY, "top");
            put(sRef.current, c.stopY, "top");
            // horizon 핸들 — horizon 이 보이는 범위를 벗어나면 플롯 안쪽(우측 가격축 바로 왼쪽)에 깔끔히 붙도록 클램프.
            // 컨테이너 폭으로만 막으면 우측 가격축 위로 올라가 반쯤 잘려 지저분 → 좌/우 축 폭을 빼 플롯 영역 [leftW, contW−rightW] 안으로.
            const hel = hRef.current;
            if (hel) {
                if (c.horizonX == null) hel.style.display = "none";
                else {
                    hel.style.display = "flex";
                    const contW = containerRef.current?.clientWidth ?? 0;
                    const rightW = chart.priceScale("right").width();
                    const half = hel.offsetWidth / 2;
                    const lo = leftW + half, hi = contW - rightW - half;
                    const nx = c.horizonX + leftW;
                    const dir = hi <= lo ? 0 : nx > hi ? 1 : nx < lo ? -1 : 0; // 플롯 밖으로 밀렸는지(방향) — 라벨 화살표.
                    hel.style.left = `${clamp(nx, lo, Math.max(lo, hi))}px`;
                    if (clampDirRef.current !== dir) { clampDirRef.current = dir; setClampDir(dir); }
                }
            }
        };
        anchor.attachPrimitive(asHeatPrimitive(prim));
        primRef.current = prim;
        return () => { seriesRef.current = null; overlayRef.current = null; primRef.current = null; markersRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 데이터 도메인(열 시각·% 범위) 변화 → 앵커 setData + 뷰 맞춤. 목표/손절/horizon 만 바뀔 땐 뷰 보존.
    const dataSig = `${model.colTimes.length}:${model.colTimes[0]}:${model.colTimes[model.colTimes.length - 1]}:${model.yLo}:${model.yHi}`;
    useEffect(() => {
        const s = seriesRef.current, chart = chartRef.current;
        if (!s || !chart) return;
        yRangeRef.current = { lo: model.yLo, hi: model.yHi };
        s.setData(model.colTimes.map((t) => ({ time: t, value: 0 })));
        chart.timeScale().fitContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSig]);

    useEffect(() => { primRef.current?.setModel(model); }, [model]);
    useEffect(() => { primRef.current?.setCellsVisible(heatOn); }, [heatOn]);

    // 선택 종목 봉 위 분봉 거래대금 마커(구간 하한 억) — OFF 또는 오버레이 없으면 비움.
    useEffect(() => {
        const mk = markersRef.current;
        if (!mk) return;
        const markers: SeriesMarker<Time>[] = [];
        if (overlay && showAmtMarkers) {
            for (const p of overlay.pts) {
                const b = amountBucketIndex(p.amount);
                if (b >= 0) markers.push({ time: (BASE + p.t * 60) as UTCTimestamp, position: "aboveBar", color: AMOUNT_BUCKET_COLORS[b], shape: "circle", size: 0, text: `${AMOUNT_BUCKETS_EOK[b]}` });
            }
        }
        mk.setMarkers(markers);
    }, [overlay, showAmtMarkers]);

    // 종목 변경 시 기본 보기 = 진입 −20분 ~ horizon(h) +20분(데이터 범위 내 클램프). horizon 은 변경 당시 값 사용.
    const ovSig = overlay ? `${overlay.name}|${overlay.entryMin}` : null;
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !ovSig) return;
        const tMin = Math.min(0, dataMinT), tMax = Math.max(1, dataMaxT);
        const from = (BASE + Math.max(-20, tMin) * 60) as UTCTimestamp;
        const to = (BASE + Math.min(horizon + 20, tMax) * 60) as UTCTimestamp;
        chart.timeScale().setVisibleRange({ from, to });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ovSig]);

    // 선택 종목 오버레이 — 좌측축 실%(어파인 범위 = 정규화 [yLo,yHi] 의 실% 상). 없으면 좌측축 숨김.
    useEffect(() => {
        const ov = overlayRef.current, chart = chartRef.current;
        if (!ov || !chart) return;
        if (overlay && overlay.pts.length > 0) {
            const aff = (norm: number): number => overlay.k * norm + 100 * (overlay.k - 1);
            overlayRangeRef.current = { lo: aff(model.yLo), hi: aff(model.yHi) };
            const amap = new Map<number, { amount: number; cumAmount: number }>();
            ov.setData(overlay.pts.map((p) => {
                const time = (BASE + p.t * 60) as UTCTimestamp;
                amap.set(time as number, { amount: p.amount, cumAmount: p.cumAmount });
                return { time, open: p.open, high: p.high, low: p.low, close: p.close };
            }));
            amountMapRef.current = amap;
            chart.priceScale("left").applyOptions({ visible: true });
        } else {
            ov.setData([]);
            amountMapRef.current = new Map();
            chart.priceScale("left").applyOptions({ visible: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overlay, model.yLo, model.yHi]);

    // 축 여백 드래그 핸들 — 컨테이너 좌표로 값 변환. 핸들은 플롯 밖(축 여백)이라 차트 팬과 안 부딪힘.
    const startDrag = (kind: "t" | "s" | "h") => (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        const container = containerRef.current, chart = chartRef.current, series = seriesRef.current;
        if (!container || !chart || !series) return;
        const rect = container.getBoundingClientRect();
        const move = (ev: PointerEvent): void => {
            if (kind === "h") {
                const t = chart.timeScale().coordinateToTime(ev.clientX - rect.left) as number | null;
                if (t != null) setHorizon(clamp((t - BASE) / 60, 1, dataMaxT));
            } else {
                const p = series.coordinateToPrice(ev.clientY - rect.top) as number | null;
                if (p == null) return;
                const v = Math.round(p * 2) / 2;
                if (kind === "t") setTarget(clamp(v, 0.5, model.yHi));
                else setStop(clamp(v, model.yLo, -0.5));
            }
        };
        const up = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const { state: tip } = useCrosshairTooltip({
        chartRef, containerRef,
        render: (param) => {
            if (!overlay) return null;
            const t = param.time as number | undefined;
            if (t === undefined) return null;
            const d = param.seriesData.get(overlayRef.current!) as { close?: number } | undefined;
            if (!d || d.close === undefined) return null;
            const elapsed = Math.round((t - BASE) / 60);
            const amt = amountMapRef.current.get(t);
            return (
                <span>
                    <b style={{ color: OVERLAY }}>{overlay.name}</b> · {fmtClock(overlay.entryMin + elapsed)} · <span style={{ color: d.close >= 0 ? RISE_COLOR : FALL_COLOR }}>{d.close >= 0 ? "+" : ""}{d.close.toFixed(1)}%</span>
                    {amt && <span style={{ color: "var(--text-tertiary)" }}> · {eok(amt.amount)} / 누적 {eok(amt.cumAmount)}</span>}
                </span>
            );
        },
    });

    // 교차선 툴팁 위치 — 실제 크기를 재서 차트 컨테이너 안으로 클램프(우/하단 공간 없으면 커서 반대편으로 플립).
    useLayoutEffect(() => {
        const el = tipRef.current, c = containerRef.current;
        if (!tip.visible || !el || !c) return;
        const m = 4, w = el.offsetWidth, h = el.offsetHeight, cw = c.clientWidth, ch = c.clientHeight;
        let left = cursor.x + 12; if (left + w > cw - m) left = cursor.x - 12 - w; left = Math.max(m, Math.min(left, cw - m - w));
        let top = cursor.y + 14; if (top + h > ch - m) top = cursor.y - 14 - h; top = Math.max(m, Math.min(top, ch - m - h));
        setTipPos({ left, top });
    }, [cursor.x, cursor.y, tip.visible, tip.content]);

    return (
        <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCursor({ x: e.clientX - r.left, y: e.clientY - r.top }); }}>
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            <div ref={tRef} onPointerDown={startDrag("t")} style={{ ...handle, right: 0, background: GREEN, display: "none" }}>+{target.toFixed(1)}%</div>
            <div ref={sRef} onPointerDown={startDrag("s")} style={{ ...handle, right: 0, background: RED, display: "none" }}>{stop.toFixed(1)}%</div>
            <div ref={hRef} onPointerDown={startDrag("h")} style={{ ...handleX, bottom: 2, background: "rgba(90,90,90,0.9)", display: "none" }}>{clampDir < 0 ? "← " : ""}{Math.round(Math.min(horizon, dataMaxT))}분{clampDir > 0 ? " →" : ""}</div>
            {tip.visible && (
                <div ref={tipRef} style={{ position: "absolute", left: tipPos.left, top: tipPos.top, pointerEvents: "none", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 5, padding: "3px 8px", fontSize: 11, whiteSpace: "nowrap", maxWidth: "calc(100% - 8px)", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.18)", zIndex: 6 }}>
                    {tip.content}
                </div>
            )}
        </div>
    );
}

const handle: CSSProperties = {
    position: "absolute", transform: "translateY(-50%)", zIndex: 5, alignItems: "center", justifyContent: "center",
    height: 15, padding: "0 5px", borderRadius: 4, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "grab",
    userSelect: "none", touchAction: "none", fontVariantNumeric: "tabular-nums", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
};
const handleX: CSSProperties = {
    position: "absolute", transform: "translateX(-50%)", zIndex: 5, alignItems: "center", justifyContent: "center",
    height: 15, padding: "0 5px", borderRadius: 4, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "grab",
    userSelect: "none", touchAction: "none", fontVariantNumeric: "tabular-nums", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
};
