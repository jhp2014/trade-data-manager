"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { IChartApi } from "lightweight-charts";
import { kstHHmm } from "@/lib/chartTime";
import styles from "./EntryMarker.module.css";

interface Props {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    time: number | null | undefined;
    label?: string;
    /** 차트 데이터 변경 trigger — 시리즈 setData 후 좌표 재계산용 */
    dataKey?: unknown;
}

export function EntryMarker({ chartRef, containerRef, time, label, dataKey }: Props) {
    const [x, setX] = useState<number | null>(null);
    const [containerHeight, setContainerHeight] = useState(0);

    useEffect(() => {
        const chart = chartRef.current;
        const container = containerRef.current;
        if (!chart || !container || time == null) {
            setX(null);
            return;
        }

        let rafId: number | null = null;

        const recalc = () => {
            rafId = null;
            const ts = chart.timeScale();
            const coord = ts.timeToCoordinate(time as Parameters<typeof ts.timeToCoordinate>[0]);
            const range = ts.getVisibleRange();
            const inRange =
                range != null &&
                time >= (range.from as number) &&
                time <= (range.to as number);

            if (coord === null || !inRange) {
                setX(null);
                return;
            }
            setX(coord);
            setContainerHeight(container.clientHeight);
        };

        const schedule = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(recalc);
        };

        recalc();

        const ts = chart.timeScale();
        ts.subscribeVisibleTimeRangeChange(schedule);
        ts.subscribeVisibleLogicalRangeChange(schedule);

        const ro = new ResizeObserver(schedule);
        ro.observe(container);

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            ts.unsubscribeVisibleTimeRangeChange(schedule);
            ts.unsubscribeVisibleLogicalRangeChange(schedule);
            ro.disconnect();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [time, dataKey]);

    if (x === null || time == null || !containerRef.current) return null;

    return createPortal(
        <div
            className={styles.markerRoot}
            style={{ left: x, height: containerHeight }}
        >
            <div className={styles.line} />
            <div className={styles.label}>
                {label ?? `▼ 진입 ${kstHHmm(time)}`}
            </div>
        </div>,
        containerRef.current,
    );
}
