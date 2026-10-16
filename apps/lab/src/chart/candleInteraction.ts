// 캔들차트 주행동 클릭 — 맨 좌클릭은 팬·크로스헤어 몫이라 비워 두고, ctrl(⌘)+클릭 또는 더블클릭만 받는다.
// 일봉(날짜 선택)·분봉(시각 선택)이 같은 정책을 쓴다 — 차이는 시각 타입 판별(resolveTime) 하나.
import { useEffect, type RefObject } from "react";
import { type IChartApi } from "lightweight-charts";
import { isModifiedClick, type ChartClickParam } from "./chartShell.js";
import { useLatest } from "../lib/useLatest.js";

export function useCandlePrimaryClick<T extends string | number>(args: {
    chartRef: RefObject<IChartApi | null>;
    /** param.time → 이 차트의 시각. 빈 영역·다른 타입이면 null. */
    resolveTime: (time: unknown) => T | null;
    onPrimaryAction: (time: T) => void;
}): void {
    const cb = useLatest(args);
    useEffect(() => {
        const chart = args.chartRef.current;
        if (!chart) return;
        const primaryAt = (param: ChartClickParam): void => {
            const t = cb.current.resolveTime(param.time);
            if (t != null) cb.current.onPrimaryAction(t);
        };
        const onClick = (param: ChartClickParam): void => {
            if (isModifiedClick(param)) primaryAt(param);
        };
        chart.subscribeClick(onClick);
        chart.subscribeDblClick(primaryAt);
        return () => {
            chart.unsubscribeClick(onClick);
            chart.unsubscribeDblClick(primaryAt);
        };
        // 구독은 마운트 1회 — 콜백은 useLatest 로 최신을 읽는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
