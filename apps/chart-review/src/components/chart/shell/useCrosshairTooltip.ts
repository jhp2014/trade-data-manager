"use client";

import { useState, useEffect, useRef, type RefObject, type ReactNode } from "react";
import type { IChartApi, MouseEventParams } from "lightweight-charts";

export type CrosshairRender = (param: MouseEventParams) => ReactNode | null;

interface UseCrosshairTooltipParams {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    render: CrosshairRender;
}

interface TooltipState {
    content: ReactNode;
    x: number;
    y: number;
    visible: boolean;
}

export function useCrosshairTooltip({ chartRef, containerRef, render }: UseCrosshairTooltipParams) {
    const [state, setState] = useState<TooltipState>({ content: null, x: 0, y: 0, visible: false });
    const rafRef = useRef<number | null>(null);
    const pendingRef = useRef<MouseEventParams | null>(null);

    // render는 렌더마다 갱신되므로 ref로 최신 값 유지
    const renderRef = useRef(render);
    useEffect(() => { renderRef.current = render; });

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
            setState({ content: null, x: 0, y: 0, visible: false });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { state };
}
