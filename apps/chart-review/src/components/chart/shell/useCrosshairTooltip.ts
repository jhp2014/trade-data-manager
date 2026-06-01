"use client";

import { useState, useEffect, useRef, type RefObject, type ReactNode } from "react";
import type { IChartApi, MouseEventParams } from "lightweight-charts";

export type CrosshairRender = (param: MouseEventParams) => ReactNode | null;

interface UseCrosshairTooltipParams {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    render: CrosshairRender;
    /** 툴팁 위치 보정용 좌측 prefix 너비 (좌측 priceScale 폭 등). 기본 0. */
    leftOffset?: () => number;
}

interface TooltipState {
    content: ReactNode;
    x: number;
    y: number;
    visible: boolean;
    leftOffset: number;
}

export function useCrosshairTooltip({ chartRef, containerRef, render, leftOffset }: UseCrosshairTooltipParams) {
    const [state, setState] = useState<TooltipState>({ content: null, x: 0, y: 0, visible: false, leftOffset: 0 });
    const rafRef = useRef<number | null>(null);
    const pendingRef = useRef<MouseEventParams | null>(null);

    // render/leftOffset은 렌더마다 갱신되므로 ref로 최신 값 유지
    const renderRef = useRef(render);
    const leftOffsetRef = useRef(leftOffset);
    useEffect(() => { renderRef.current = render; });
    useEffect(() => { leftOffsetRef.current = leftOffset; });

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        function flush() {
            rafRef.current = null;
            const param = pendingRef.current;
            pendingRef.current = null;
            if (!param) return;

            const c = containerRef.current;
            if (!c || !param.point || !param.time ||
                param.point.x < 0 || param.point.x > c.clientWidth ||
                param.point.y < 0 || param.point.y > c.clientHeight) {
                setState((s) => ({ ...s, visible: false }));
                return;
            }

            const content = renderRef.current(param);
            if (content === null) {
                setState((s) => ({ ...s, visible: false }));
                return;
            }

            setState({
                content,
                x: param.point.x,
                y: param.point.y,
                visible: true,
                leftOffset: leftOffsetRef.current?.() ?? 0,
            });
        }

        function handler(param: MouseEventParams) {
            const c = containerRef.current;
            if (!c || !param.point || !param.time ||
                param.point.x < 0 || param.point.x > c.clientWidth ||
                param.point.y < 0 || param.point.y > c.clientHeight) {
                if (rafRef.current !== null) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
                pendingRef.current = null;
                setState((s) => ({ ...s, visible: false }));
                return;
            }

            pendingRef.current = param;
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(flush);
        }

        chart.subscribeCrosshairMove(handler);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            pendingRef.current = null;
            setState({ content: null, x: 0, y: 0, visible: false, leftOffset: 0 });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { state };
}
