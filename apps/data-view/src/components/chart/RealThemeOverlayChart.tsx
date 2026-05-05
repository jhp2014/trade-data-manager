"use client";

import { useEffect, useRef } from "react";
import {
    createChart,
    CrosshairMode,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from "lightweight-charts";
import type {
    ChartOverlaySeries,
    ChartOverlayPoint,
} from "@/actions/chartPreview";
import { kstHHmm } from "@/lib/chartTime";

interface Props {
    data: ChartOverlaySeries[];
    height?: number;
    markerTime?: number | null;
}

const PALETTE = [
    "#60a5fa",
    "#34d399",
    "#fbbf24",
    "#f472b6",
    "#a78bfa",
    "#fb7185",
    "#22d3ee",
    "#fde047",
    "#c084fc",
    "#4ade80",
];

const fmtAmount = (v: number) => {
    if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
    return v.toFixed(0);
};

export function RealThemeOverlayChart({
    data,
    height = 680,
    markerTime,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    // series 메타: 종목명/색상/시간별 포인트맵
    const seriesMetaRef = useRef<
        Array<{
            name: string;
            color: string;
            isSelf: boolean;
            api: ISeriesApi<"Line">;
            pointMap: Map<number, ChartOverlayPoint>;
        }>
    >([]);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);
    const pendingRef = useRef<{ x: number; y: number; time: number } | null>(
        null,
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            width: container.clientWidth,
            height,
            layout: {
                background: { color: "transparent" },
                textColor: "#a0a0a0",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: "rgba(255,255,255,0.04)" },
                horzLines: { color: "rgba(255,255,255,0.04)" },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: "rgba(180,180,180,0.6)",
                    style: LineStyle.Solid,
                    labelVisible: true,
                },
                horzLine: {
                    visible: false,
                    labelVisible: false,
                },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.05, bottom: 0.10 },
            },
            timeScale: {
                borderVisible: false,
                rightOffset: 2,
                minBarSpacing: 1,
                tickMarkFormatter: (t: number) => kstHHmm(t),
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: false,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
            localization: {
                locale: "ko-KR",
                timeFormatter: (t: number) => kstHHmm(t),
                priceFormatter: (p: number) =>
                    `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
            },
        });

        chartRef.current = chart;

        // 0% 기준선은 첫 시리즈가 생성될 때 createPriceLine으로 추가
        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({ width: containerRef.current.clientWidth });
            }
        });
        ro.observe(container);

        // 추적 모달 (rAF 스로틀 + 같은 시간 skip + innerHTML 직접조작)
        chart.subscribeCrosshairMove((param) => {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            if (!tip || !c) return;

            if (
                !param.point ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > c.clientWidth ||
                param.point.y < 0 ||
                param.point.y > c.clientHeight
            ) {
                tip.style.display = "none";
                lastTimeRef.current = null;
                return;
            }

            pendingRef.current = {
                x: param.point.x,
                y: param.point.y,
                time: param.time as number,
            };
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

            // 같은 시간이면 위치만 갱신
            if (lastTimeRef.current === p.time && tip.style.display === "block") {
                positionTooltip(p.x, p.y);
                return;
            }
            lastTimeRef.current = p.time;

            const rows = seriesMetaRef.current
                .map((m) => {
                    const pt = m.pointMap.get(p.time);
                    if (!pt) return null;
                    return {
                        name: m.name,
                        color: m.color,
                        isSelf: m.isSelf,
                        rate: pt.value,
                        amount: pt.amount ?? 0,
                        cumAmount: pt.cumAmount ?? 0,
                    };
                })
                .filter((r): r is NonNullable<typeof r> => r !== null)
                .sort((a, b) => b.rate - a.rate);

            if (rows.length === 0) {
                tip.style.display = "none";
                return;
            }

            const head = `
        <div style="font-size:11px;color:#a0a0a0;margin-bottom:6px;display:flex;justify-content:space-between;gap:12px">
          <span>${kstHHmm(p.time)}</span>
          <span>${rows.length}종목</span>
        </div>
        <div style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:3px 10px;font-size:11px;font-variant-numeric:tabular-nums">
          <div></div>
          <div style="color:#a0a0a0">종목</div>
          <div style="color:#a0a0a0;text-align:right">변동률</div>
          <div style="color:#a0a0a0;text-align:right">분거래대금</div>
          <div style="color:#a0a0a0;text-align:right">누적</div>
      `;
            const body = rows
                .map((r) => {
                    const rateColor = r.rate >= 0 ? "#ef4444" : "#3b82f6";
                    const nameStyle = r.isSelf
                        ? "color:#fff;font-weight:600"
                        : "color:#d4d4d8";
                    return `
            <div style="width:8px;height:8px;border-radius:50%;background:${r.color};align-self:center"></div>
            <div style="${nameStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${r.name}</div>
            <div style="text-align:right;color:${rateColor}">${r.rate >= 0 ? "+" : ""}${r.rate.toFixed(2)}%</div>
            <div style="text-align:right;color:#d4d4d8">${fmtAmount(r.amount)}</div>
            <div style="text-align:right;color:#a0a0a0">${fmtAmount(r.cumAmount)}</div>
          `;
                })
                .join("");

            tip.innerHTML = `${head}${body}</div>`;
            tip.style.display = "block";
            positionTooltip(p.x, p.y);
        }

        function positionTooltip(x: number, y: number) {
            const tip = tooltipRef.current;
            const c = containerRef.current;
            if (!tip || !c) return;
            const TW = tip.offsetWidth || 320;
            const TH = tip.offsetHeight || 200;
            const M = 14;
            let left = x + M;
            if (left + TW > c.clientWidth) left = x - M - TW;
            if (left < 0) left = M;
            let top = y + M;
            if (top + TH > c.clientHeight) top = y - M - TH;
            if (top < 0) top = M;
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
        }

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesMetaRef.current = [];
        };
    }, [height]);

    // 데이터 갱신: 기존 시리즈 제거 후 다시 생성
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        // 기존 시리즈 제거
        for (const m of seriesMetaRef.current) {
            try {
                chart.removeSeries(m.api);
            } catch {
                /* noop */
            }
        }
        seriesMetaRef.current = [];

        if (!data || data.length === 0) return;

        // self를 맨 위로 (마지막에 그려져서 가장 잘 보이도록)
        const ordered = [...data].sort((a, b) => {
            if (a.isSelf === b.isSelf) return 0;
            return a.isSelf ? 1 : -1;
        });

        let firstSeries: ISeriesApi<"Line"> | null = null;

        ordered.forEach((s, idx) => {
            const color = s.isSelf ? "#fbbf24" : PALETTE[idx % PALETTE.length];
            const api: ISeriesApi<"Line"> = chart.addLineSeries({
                color,
                lineWidth: (s.isSelf ? 2 : 1) as 1 | 2,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 3,
            });
            const pointMap = new Map<number, ChartOverlayPoint>();
            const points = s.series.map((p) => {
                pointMap.set(p.time, p);
                return { time: p.time as Time, value: p.value };
            });
            api.setData(points);

            seriesMetaRef.current.push({
                name: s.stockName ?? s.stockCode ?? "?",
                color,
                isSelf: s.isSelf,
                api,
                pointMap,
            });
            if (firstSeries === null) firstSeries = api;
        });

        // 0% 기준선
        if (firstSeries !== null) {
            (firstSeries as ISeriesApi<"Line">).createPriceLine({
                price: 0,
                color: "rgba(150,150,150,0.5)",
                lineStyle: LineStyle.Dashed,
                lineWidth: 1,
                axisLabelVisible: false,
                title: "",
            });
        }

        chart.timeScale().fitContent();
    }, [data]);

    // 진입 마커: self 시리즈에만
    useEffect(() => {
        if (markerTime == null) return;
        const self = seriesMetaRef.current.find((m) => m.isSelf);
        if (!self) return;
        self.api.setMarkers([
            {
                time: markerTime as Time,
                position: "aboveBar",
                color: "#fbbf24",
                shape: "arrowDown",
                text: "",
            },
        ]);
    }, [markerTime, data]);

    return (
        <div
            ref={containerRef}
            style={{ position: "relative", width: "100%", height }}
        >
            <div
                ref={tooltipRef}
                style={{
                    position: "absolute",
                    display: "none",
                    pointerEvents: "none",
                    padding: "10px 12px",
                    background: "rgba(20,20,24,0.95)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 6,
                    color: "#fff",
                    zIndex: 10,
                    fontFamily: "inherit",
                    minWidth: 280,
                    maxWidth: 380,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}
            />
        </div>
    );
}
