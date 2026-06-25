"use client";

import { useEffect, useRef } from "react";
import { CrosshairMode, LineSeries, LineStyle, createSeriesMarkers, type ISeriesApi, type ISeriesMarkersPluginApi, type Time } from "lightweight-charts";
import type { ChartOverlaySeries, ChartOverlayPoint } from "@/types/chart";
import { kstHHmm } from "@trade-data-manager/chart-utils";
import { useUiStore } from "@/stores/useUiStore";
import { useChartShell } from "./shell/useChartShell";
import { useCrosshairTooltip } from "./shell/useCrosshairTooltip";
import { ChartTooltip } from "./tooltip/ChartTooltip";
import { OverlayTooltip } from "./tooltip/OverlayTooltip";
import type { OverlayTooltipRow } from "./tooltip/ThemeRowList";
import { OVERLAY_SELF_COLOR, OVERLAY_PEER_PALETTE } from "@/lib/colors";
import styles from "./RealThemeOverlayChart.module.css";

interface Props {
    data: ChartOverlaySeries[];
    markerTime?: number | null;
}

export function RealThemeOverlayChart({ data, markerTime }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    const mode = useUiStore((s) => s.chartPriceMode);

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
    // v5: setMarkers 제거 → self 시리즈에 붙인 마커 플러그인 핸들. 시리즈 재생성 시 무효화.
    const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

    const { state: tipState } = useCrosshairTooltip({
        chartRef,
        containerRef,
        render: (param) => {
            const t = param.time as number | undefined;
            if (t === undefined) return null;

            const useNxt = mode === "nxt";
            const rows: OverlayTooltipRow[] = seriesMetaRef.current
                .map((m) => {
                    const pt = m.pointMap.get(t);
                    if (!pt) return null;
                    return {
                        stockCode: m.stockCode,
                        stockName: m.name,
                        color: m.color,
                        isSelf: m.isSelf,
                        rate: useNxt ? pt.valueNxt : pt.valueKrx,
                        amount: pt.amount ?? 0,
                        cumAmount: pt.cumAmount ?? 0,
                    };
                })
                .filter((r): r is OverlayTooltipRow => r !== null)
                .sort((a, b) => b.rate - a.rate);

            if (rows.length === 0) return null;
            return <OverlayTooltip time={t} rows={rows} />;
        },
    });

    // 시리즈 생성: data 변경 시 기존 시리즈 제거 후 재생성
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        for (const m of seriesMetaRef.current) {
            try { chart.removeSeries(m.api); } catch { /* noop */ }
        }
        seriesMetaRef.current = [];
        markersApiRef.current = null;

        if (!data || data.length === 0) return;

        // self 는 뒤에 그려 위로 올라오게
        const ordered = [...data].sort((a, b) => {
            if (a.isSelf === b.isSelf) return 0;
            return a.isSelf ? 1 : -1;
        });

        let firstSeries: ISeriesApi<"Line"> | null = null;

        ordered.forEach((s, idx) => {
            const color = s.isSelf
                ? OVERLAY_SELF_COLOR
                : OVERLAY_PEER_PALETTE[idx % OVERLAY_PEER_PALETTE.length];
            const api = chart.addSeries(LineSeries, {
                color,
                lineWidth: (s.isSelf ? 4 : 1) as 1 | 4,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 3,
            });
            const pointMap = new Map<number, ChartOverlayPoint>();
            s.series.forEach((p) => pointMap.set(p.time, p));

            seriesMetaRef.current.push({
                stockCode: s.stockCode,
                name: s.stockName ?? s.stockCode ?? "?",
                color,
                isSelf: s.isSelf,
                api,
                pointMap,
            });
            if (firstSeries === null) firstSeries = api;
        });

        // 기준선 (0%)
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

        // 진입 마커 플러그인을 self 시리즈와 한 생명주기로 생성(아래 마커 effect는 setMarkers만)
        const selfMeta = seriesMetaRef.current.find((m) => m.isSelf);
        if (selfMeta) markersApiRef.current = createSeriesMarkers(selfMeta.api);

        chart.timeScale().fitContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // 데이터 갱신: mode 전환 시 값만 swap
    useEffect(() => {
        const useNxt = mode === "nxt";
        for (const m of seriesMetaRef.current) {
            const points = Array.from(m.pointMap.values())
                .sort((a, b) => a.time - b.time)
                .map((p) => ({ time: p.time as Time, value: useNxt ? p.valueNxt : p.valueKrx }));
            m.api.setData(points);
        }
    }, [data, mode]);

    // 진입 마커: self 시리즈 플러그인에 내용만 갱신(핸들은 위 시리즈 생성 effect가 소유)
    useEffect(() => {
        if (markerTime == null) return;
        markersApiRef.current?.setMarkers([{
            time: markerTime as Time,
            position: "aboveBar",
            color: "#000000ff",
            shape: "arrowDown",
            text: "✅Point✅",
        }]);
    }, [markerTime, data]);

    if (!data || data.length === 0) {
        return (
            <div className={styles.empty}>
                테마 오버레이 데이터 없음
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
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
