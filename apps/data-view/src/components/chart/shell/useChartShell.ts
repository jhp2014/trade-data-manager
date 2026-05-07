import { useEffect, useRef, type RefObject } from "react";
import { createChart, type IChartApi, type DeepPartial, type ChartOptions } from "lightweight-charts";

/**
 * lightweight-charts 인스턴스 생성·ResizeObserver·정리를 담당하는 공통 셸 훅.
 * 이 훅이 실행된 직후의 useEffect에서 chartRef.current가 보장된다.
 * See: RealDailyChart, RealMinuteChart, RealThemeOverlayChart
 */
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
        // makeOptions는 컴포넌트 생성 시 한 번만 사용하므로 deps에서 제외
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return chartRef;
}
