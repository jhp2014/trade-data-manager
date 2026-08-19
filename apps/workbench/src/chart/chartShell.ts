// 차트 공통 셸 — chart-review 의 shell(chartOptions·useChartShell·useCrosshairTooltip)을
// workbench 로 재구현한 것. lightweight-charts 인스턴스 생성/리사이즈/정리 + 크로스헤어 툴팁.
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject, type ReactNode } from "react";
import {
    createChart,
    LineStyle,
    type IChartApi,
    type ChartOptions,
    type DeepPartial,
    type MouseEventParams,
} from "lightweight-charts";

/** 차트 종류 무관 공통 외형/조작 옵션. 종류별 차이는 스프레드 후 덮어쓴다. */
export function baseChartOptions(): DeepPartial<ChartOptions> {
    return {
        layout: {
            background: { color: "transparent" },
            textColor: "#6b7280",
            fontSize: 11,
            panes: {
                separatorColor: "rgba(0,0,0,0.12)",
                separatorHoverColor: "rgba(0,0,0,0.2)",
                enableResize: true,
            },
        },
        grid: {
            vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
            horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    };
}

/** 차트 클릭 파라미터 — MouseEventParams 중 이 앱이 실제로 읽는 필드만. */
export type ChartClickParam = {
    time?: unknown;
    point?: { x: number; y: number };
    paneIndex?: number;
    sourceEvent?: { ctrlKey: boolean; metaKey: boolean };
};

/**
 * 수식(ctrl, 맥은 ⌘) 클릭 여부. 맨 좌클릭은 팬/크로스헤어 몫으로 비워두고, 상태를 바꾸는
 * 클릭(일봉 날짜검색·분봉 타점이동)은 ctrl+클릭 또는 더블클릭만 받는다.
 * sourceEvent 는 마우스/터치가 아닌 이벤트에선 없음 → 없으면 맨클릭 취급.
 */
export function isModifiedClick(param: ChartClickParam): boolean {
    const e = param.sourceEvent;
    return e != null && (e.ctrlKey || e.metaKey);
}

/** createChart + ResizeObserver + 정리. 실행 직후 useEffect 에서 chartRef.current 보장. */
export function useChartShell(
    containerRef: RefObject<HTMLDivElement | null>,
    makeOptions: () => DeepPartial<ChartOptions>,
): RefObject<IChartApi | null> {
    const chartRef = useRef<IChartApi | null>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const chart = createChart(container, {
            width: container.clientWidth || 800,
            height: container.clientHeight || 600,
            ...makeOptions(),
        });
        chartRef.current = chart;
        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        });
        ro.observe(container);
        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
        };
        // makeOptions 는 마운트 1회만 사용
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return chartRef;
}

/**
 * 컨테이너 상대 커서 좌표(툴팁 위치용) — **rAF 스로틀**. mousemove 마다 setState 하면 프레임보다 잦은
 * 리렌더가 차트 컴포넌트 전체를 태운다(크로스헤어 툴팁 handler 와 같은 이유·같은 패턴). 마지막 좌표를
 * ref 에 쌓고 프레임당 한 번만 커밋한다. 반환 onMouseMove 는 안정 참조(ref 만 만짐).
 */
export function useRafCursor(): { cursor: { x: number; y: number }; onCursorMove: (e: ReactMouseEvent<HTMLDivElement>) => void } {
    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const rafRef = useRef<number | null>(null);
    const pendingRef = useRef({ x: 0, y: 0 });
    useEffect(
        () => () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        },
        [],
    );
    const onCursorMove = useCallback((e: ReactMouseEvent<HTMLDivElement>): void => {
        const r = e.currentTarget.getBoundingClientRect();
        pendingRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setCursor(pendingRef.current);
        });
    }, []);
    return { cursor, onCursorMove };
}

export type CrosshairRender = (param: MouseEventParams) => ReactNode | null;

interface TooltipState {
    content: ReactNode;
    x: number;
    y: number;
    visible: boolean;
}

/** 크로스헤어 이동 구독 → rAF 스로틀로 render() 결과를 툴팁 상태로. 컨테이너 밖이면 숨김. */
export function useCrosshairTooltip(params: {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    render: CrosshairRender;
}): { state: TooltipState } {
    const { chartRef, containerRef, render } = params;
    const [state, setState] = useState<TooltipState>({ content: null, x: 0, y: 0, visible: false });
    const rafRef = useRef<number | null>(null);
    const pendingRef = useRef<MouseEventParams | null>(null);
    const renderRef = useRef(render);
    useEffect(() => {
        renderRef.current = render;
    });

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        const inBounds = (param: MouseEventParams): boolean => {
            const c = containerRef.current;
            return !!(
                c &&
                param.point &&
                param.time &&
                param.point.x >= 0 &&
                param.point.x <= c.clientWidth &&
                param.point.y >= 0 &&
                param.point.y <= c.clientHeight
            );
        };

        function flush(): void {
            rafRef.current = null;
            const param = pendingRef.current;
            pendingRef.current = null;
            if (!param || !inBounds(param)) {
                setState((s) => ({ ...s, visible: false }));
                return;
            }
            const content = renderRef.current(param);
            if (content === null) {
                setState((s) => ({ ...s, visible: false }));
                return;
            }
            setState({ content, x: param.point!.x, y: param.point!.y, visible: true });
        }

        function handler(param: MouseEventParams): void {
            if (!inBounds(param)) {
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
            chart.unsubscribeCrosshairMove(handler);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            pendingRef.current = null;
            setState({ content: null, x: 0, y: 0, visible: false });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { state };
}
