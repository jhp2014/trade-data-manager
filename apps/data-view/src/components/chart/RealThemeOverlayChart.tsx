"use client";

import { useEffect, useRef } from "react";
import { CrosshairMode, LineStyle, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartOverlaySeries, ChartOverlayPoint } from "@/types/chart";
import { kstHHmm } from "@/lib/chartTime";
import { useChartShell } from "./shell/useChartShell";
import { positionTooltip, TOOLTIP_STYLE } from "./shell/tooltipUtils";

interface Props {
    data: ChartOverlaySeries[];
    markerTime?: number | null;
}

const PALETTE = [
    "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
    "#fb7185", "#22d3ee", "#fde047", "#c084fc", "#4ade80",
];

function fmtAmount(v: number) {
    if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
    return v.toFixed(0);
}

export function RealThemeOverlayChart({ data, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const chartRef = useChartShell(containerRef, () => ({
        layout: { background: { color: "transparent" }, textColor: "#a0a0a0", fontSize: 11 },
        grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(180,180,180,0.6)", style: 0, labelVisible: true },
            horzLine: { visible: false, labelVisible: false },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.10 } },
        timeScale: {
            borderVisible: false, rightOffset: 2, minBarSpacing: 1,
            tickMarkFormatter: (t: number) => kstHHmm(t),
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        localization: {
            locale: "ko-KR",
            timeFormatter: (t: number) => kstHHmm(t),
            priceFormatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
        },
    }));

    const seriesMetaRef = useRef<Array<{
        name: string; color: string; isSelf: boolean;
        api: ISeriesApi<"Line">; pointMap: Map<number, ChartOverlayPoint>;
    }>>([]);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);
    const pendingRef = useRef<{ x: number; y: number; time: number } | null>(null);

    // 툴팁 구독 (마운트 1회)
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        chart.subscribeCrosshairMove((param) => {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            if (!tip || !c) return;

            if (!param.point || !param.time ||
                param.point.x < 0 || param.point.x > c.clientWidth ||
                param.point.y < 0 || param.point.y > c.clientHeight) {
                tip.style.display = "none";
                lastTimeRef.current = null;
                return;
            }

            pendingRef.current = { x: param.point.x, y: param.point.y, time: param.time as number };
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                renderTooltip();
            });
        });

        function renderTooltip() {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            const p = pendingRef.current;
            if (!tip || !c || !p) return;

            if (lastTimeRef.current === p.time && tip.style.display === "block") {
                positionTooltip(tip, c, p.x, p.y);
                return;
            }
            lastTimeRef.current = p.time;

            const rows = seriesMetaRef.current
                .map((m) => {
                    const pt = m.pointMap.get(p.time);
                    if (!pt) return null;
                    return { name: m.name, color: m.color, isSelf: m.isSelf, rate: pt.value, amount: pt.amount ?? 0, cumAmount: pt.cumAmount ?? 0 };
                })
                .filter((r): r is NonNullable<typeof r> => r !== null)
                .sort((a, b) => b.rate - a.rate);

            if (rows.length === 0) { tip.style.display = "none"; return; }

            const head = `
                <div style="font-size:11px;color:#a0a0a0;margin-bottom:6px;display:flex;justify-content:space-between;gap:12px">
                    <span>Time: ${kstHHmm(p.time)}</span>
                    <span>${rows.length}종목</span>
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:3px 10px;font-size:11px;font-variant-numeric:tabular-nums">
                    <div></div>
                    <div style="color:#a0a0a0">종목</div>
                    <div style="color:#a0a0a0;text-align:right">변동률</div>
                    <div style="color:#a0a0a0;text-align:right">분거래대금</div>
                    <div style="color:#a0a0a0;text-align:right">누적</div>`;
            const body = rows.map((r) => {
                const rateColor = r.rate >= 0 ? "#ef4444" : "#3b82f6";
                const nameStyle = r.isSelf ? "color:#fff;font-weight:600" : "color:#d4d4d8";
                return `
                    <div style="width:8px;height:8px;border-radius:50%;background:${r.color};align-self:center"></div>
                    <div style="${nameStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${r.name}</div>
                    <div style="text-align:right;color:${rateColor}">${r.rate >= 0 ? "+" : ""}${r.rate.toFixed(2)}%</div>
                    <div style="text-align:right;color:#d4d4d8">${fmtAmount(r.amount)}</div>
                    <div style="text-align:right;color:#a0a0a0">${fmtAmount(r.cumAmount)}</div>`;
            }).join("");

            tip.innerHTML = `${head}${body}</div>`;
            tip.style.display = "block";
            positionTooltip(tip, c, p.x, p.y);
        }

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            seriesMetaRef.current = [];
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 데이터 갱신: 기존 시리즈 제거 후 재생성
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        for (const m of seriesMetaRef.current) {
            try { chart.removeSeries(m.api); } catch { /* noop */ }
        }
        seriesMetaRef.current = [];

        if (!data || data.length === 0) return;

        const ordered = [...data].sort((a, b) => {
            if (a.isSelf === b.isSelf) return 0;
            return a.isSelf ? 1 : -1;
        });

        let firstSeries: ISeriesApi<"Line"> | null = null;

        ordered.forEach((s, idx) => {
            const color = s.isSelf ? "#fbbf24" : PALETTE[idx % PALETTE.length];
            const api = chart.addLineSeries({
                color, lineWidth: (s.isSelf ? 4 : 1) as 1 | 4,
                priceLineVisible: false, lastValueVisible: false,
                crosshairMarkerVisible: true, crosshairMarkerRadius: 3,
            });
            const pointMap = new Map<number, ChartOverlayPoint>();
            const points = s.series.map((p) => {
                pointMap.set(p.time, p);
                return { time: p.time as Time, value: p.value };
            });
            api.setData(points);
            seriesMetaRef.current.push({ name: s.stockName ?? s.stockCode ?? "?", color, isSelf: s.isSelf, api, pointMap });
            if (firstSeries === null) firstSeries = api;
        });

        if (firstSeries !== null) {
            (firstSeries as ISeriesApi<"Line">).createPriceLine({
                price: 0, color: "rgba(150,150,150,0.5)", lineStyle: LineStyle.Dashed,
                lineWidth: 1, axisLabelVisible: false, title: "",
            });
        }

        chart.timeScale().fitContent();
    }, [data]);

    // 진입 마커: self 시리즈에만
    useEffect(() => {
        if (markerTime == null) return;
        const self = seriesMetaRef.current.find((m) => m.isSelf);
        if (!self) return;
        self.api.setMarkers([{ time: markerTime as Time, position: "aboveBar", color: "#fbbf24", shape: "arrowDown", text: "" }]);
    }, [markerTime, data]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div ref={tooltipRef} style={{ ...TOOLTIP_STYLE, minWidth: 280, maxWidth: 380 }} />
        </div>
    );
}
