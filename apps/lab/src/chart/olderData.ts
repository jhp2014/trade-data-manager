// 왼쪽으로 끌면 과거를 더 받는 차트(일봉 덩이 · 분봉 여러 날)의 손잡이.
// 앞에 봉이 붙어도 화면을 따로 맞추지 않는다 — lightweight-charts 가 setData 때 오른쪽 기준을 지켜 논리 범위를 스스로
// 민다(같은 봉이 제자리에 남는다). 여기서 한 번 더 밀면 화면이 미래 쪽으로 튄다(2026-10-29 실측).
import { useEffect, type RefObject } from "react";
import { type IChartApi, type LogicalRange } from "lightweight-charts";
import { useLatest } from "../lib/useLatest.js";

/**
 * 첫 봉 왼쪽 빈칸이 이만큼(봉 수) 넘게 보이면 더 받는다 — 사용자가 끝을 넘어 끌었다는 뜻.
 * 처음 프레이밍의 여백(분봉 개장 −10분 · 일봉 −3봉)으로는 걸리지 않는 폭. 다만 확대해 보이는 봉이 적으면
 * lightweight-charts 가 빈칸을 (보이는 봉 수 − 2)까지만 허락하므로 그 폭의 30% 로 줄인다.
 */
const LOAD_EDGE_BARS = 20;
const loadEdge = (r: LogicalRange): number => -Math.min(LOAD_EDGE_BARS, (r.to - r.from) * 0.3);

/** 보이는 범위의 왼쪽 끝이 첫 봉을 넘어 빈칸으로 들어가면 onNeedOlder(받는 중 중복·멈춤은 호출자가 막는다). */
export function useLoadOlderAtLeftEdge(chartRef: RefObject<IChartApi | null>, onNeedOlder: (() => void) | undefined): void {
    const cb = useLatest(onNeedOlder);
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const onRange = (r: LogicalRange | null): void => {
            if (r && r.from < loadEdge(r)) cb.current?.();
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
        return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
        // 구독은 마운트 1회 — 콜백은 useLatest 로 최신을 읽는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
