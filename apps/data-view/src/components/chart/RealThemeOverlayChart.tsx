"use client";

import { useEffect, useRef, useState } from "react";
import { CrosshairMode, LineStyle, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartOverlaySeries, ChartOverlayPoint } from "@/types/chart";
import type { StockMetricsDTO } from "@/types/deck";
import type { MemberPredicate } from "@/lib/member/predicate";
import { isMember } from "@/lib/member/predicate";
import { kstHHmm } from "@/lib/chartTime";
import { useChartShell } from "./shell/useChartShell";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { OverlayTooltip } from "./tooltip/OverlayTooltip";
import type { OverlayTooltipRow } from "./tooltip/ThemeRowList";
import { SELF_COLOR, PALETTE } from "@/lib/chart/overlay";
import styles from "./RealThemeOverlayChart.module.css";

export interface ActivePredicateInstance {
    id: string;
    label: string;
    predicate: MemberPredicate;
}

interface Props {
    data: ChartOverlaySeries[];
    markerTime?: number | null;
    activePredicateInstances?: ActivePredicateInstance[];
}

export function RealThemeOverlayChart({ data, markerTime, activePredicateInstances = [] }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedFilter, setSelectedFilter] = useState<"all" | string>("all");

    const chartRef = useChartShell(containerRef, () => ({
        layout: { background: { color: "transparent" }, textColor: "#6b7280", fontSize: 11 },
        grid: {
            vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
            horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { width: 1, color: "rgba(60,60,60,0.5)", style: 0, labelVisible: true },
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
        stockCode: string;
        name: string;
        color: string;
        isSelf: boolean;
        api: ISeriesApi<"Line">;
        pointMap: Map<number, ChartOverlayPoint>;
    }>>([]);

    const { state: tipState } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as number | undefined;
            if (t === undefined) return null;

            const rows: OverlayTooltipRow[] = seriesMetaRef.current
                .map((m) => {
                    const pt = m.pointMap.get(t);
                    if (!pt) return null;
                    return { stockCode: m.stockCode, stockName: m.name, color: m.color, isSelf: m.isSelf, rate: pt.value, amount: pt.amount ?? 0, cumAmount: pt.cumAmount ?? 0 };
                })
                .filter((r): r is OverlayTooltipRow => r !== null)
                .sort((a, b) => b.rate - a.rate);

            if (rows.length === 0) return null;
            return <OverlayTooltip time={t} rows={rows} />;
        },
    });

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
            const color = s.isSelf ? SELF_COLOR : PALETTE[idx % PALETTE.length];
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
            seriesMetaRef.current.push({ stockCode: s.stockCode, name: s.stockName ?? s.stockCode ?? "?", color, isSelf: s.isSelf, api, pointMap });
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

    // 가시성 업데이트: selectedFilter 또는 data 변경 시 (data effect 이후 실행 보장)
    useEffect(() => {
        if (selectedFilter === "all") {
            seriesMetaRef.current.forEach((m) => m.api.applyOptions({ visible: true }));
            return;
        }
        const inst = activePredicateInstances.find((p) => p.id === selectedFilter);
        if (!inst) {
            seriesMetaRef.current.forEach((m) => m.api.applyOptions({ visible: true }));
            return;
        }
        seriesMetaRef.current.forEach((m) => {
            if (m.isSelf) {
                m.api.applyOptions({ visible: true });
                return;
            }
            const dataSeries = data.find((s) => s.stockCode === m.stockCode);
            const lastPoint = dataSeries?.series[dataSeries.series.length - 1];
            // StockMetricsDTO 부분 구성: closeRate·cumulativeAmount만 차트 데이터로 추론 가능
            const partialMetrics: StockMetricsDTO = {
                stockCode: m.stockCode,
                stockName: m.name,
                closeRate: lastPoint?.value ?? null,
                cumulativeAmount: lastPoint != null ? String(lastPoint.cumAmount) : null,
                dayHighRate: null,
                pullbackFromHigh: null,
                minutesSinceDayHigh: null,
                currentMinuteAmount: null,
                amountDistribution: null,
            };
            m.api.applyOptions({ visible: isMember(partialMetrics, inst.predicate) });
        });
    }, [data, selectedFilter, activePredicateInstances]);

    // 선택된 인스턴스가 사라지면 "all"로 리셋
    useEffect(() => {
        if (selectedFilter !== "all" && !activePredicateInstances.find((p) => p.id === selectedFilter)) {
            setSelectedFilter("all");
        }
    }, [activePredicateInstances, selectedFilter]);

    // 진입 마커: self 시리즈에만
    useEffect(() => {
        if (markerTime == null) return;
        const self = seriesMetaRef.current.find((m) => m.isSelf);
        if (!self) return;
        self.api.setMarkers([{ time: markerTime as Time, position: "aboveBar", color: "#000000ff", shape: "arrowDown", text: "✅Point✅"}]);
    }, [markerTime, data]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            {activePredicateInstances.length > 0 && (
                <div className={styles.filterToggle}>
                    <button
                        type="button"
                        className={`${styles.filterBtn} ${selectedFilter === "all" ? styles.filterBtnActive : ""}`}
                        onClick={() => setSelectedFilter("all")}
                    >
                        전체
                    </button>
                    {activePredicateInstances.map((inst) => (
                        <button
                            key={inst.id}
                            type="button"
                            className={`${styles.filterBtn} ${selectedFilter === inst.id ? styles.filterBtnActive : ""}`}
                            onClick={() => setSelectedFilter(inst.id)}
                        >
                            {inst.label}
                        </button>
                    ))}
                </div>
            )}
            <ChartTooltip
                visible={tipState.visible}
                x={tipState.x}
                y={tipState.y}
                containerRef={containerRef}
                minWidth={280}
                maxWidth={380}
            >
                {tipState.content}
            </ChartTooltip>
        </div>
    );
}
