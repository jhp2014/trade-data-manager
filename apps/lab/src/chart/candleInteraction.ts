// 캔들차트 주행동 클릭 — 맨 좌클릭은 팬·크로스헤어 몫이라 비워 두고, ctrl(⌘)+클릭 또는 더블클릭만 받는다.
// 일봉(날짜 선택)·분봉(시각 선택)이 같은 정책을 쓴다 — 차이는 시각 타입 판별(resolveTime) 하나.
// shift+클릭은 일봉 선 긋기 몫(useCandleShiftClick).
import { useEffect, type RefObject } from "react";
import { type IChartApi, type MouseEventParams } from "lightweight-charts";
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
        // shift 두 번 빨리 = 선 긋기·지우기(useCandleShiftClick)지 날짜 선택이 아니다
        const onDblClick = (param: ChartClickParam): void => {
            if (!param.sourceEvent?.shiftKey) primaryAt(param);
        };
        chart.subscribeClick(onClick);
        chart.subscribeDblClick(onDblClick);
        return () => {
            chart.unsubscribeClick(onClick);
            chart.unsubscribeDblClick(onDblClick);
        };
        // 구독은 마운트 1회 — 콜백은 useLatest 로 최신을 읽는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/**
 * shift+클릭 — 봉 하나와 클릭한 높이(그 pane 의 y 좌표·pane 번호)를 넘긴다. 일봉 선 긋기가 쓴다(값 붙이기는 받는 쪽).
 * ctrl+클릭·더블클릭(주행동)과 겹치지 않는다 — shift 와 ctrl 을 같이 누르면 주행동 몫으로 둔다.
 */
export function useCandleShiftClick<T extends string | number>(args: {
    chartRef: RefObject<IChartApi | null>;
    resolveTime: (time: unknown) => T | null;
    onShiftClick: (time: T, y: number, paneIndex: number) => void;
}): void {
    const cb = useLatest(args);
    useEffect(() => {
        const chart = args.chartRef.current;
        if (!chart) return;
        const onClick = (param: MouseEventParams): void => {
            const e = param.sourceEvent;
            if (!e || !e.shiftKey || e.ctrlKey || e.metaKey || !param.point) return;
            const t = cb.current.resolveTime(param.time);
            if (t != null) cb.current.onShiftClick(t, param.point.y, param.paneIndex ?? 0);
        };
        chart.subscribeClick(onClick);
        return () => chart.unsubscribeClick(onClick);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
