import type { IChartApi } from "lightweight-charts";
import type { ChartCandle } from "@/types/chart";

/** indicator의 내부 상태를 담는 불투명 핸들 */
export type IndicatorHandle = Record<string, unknown>;

/**
 * 차트에 부착 가능한 지표 플러그인 인터페이스.
 * TData: 업데이트 시 전달할 데이터 타입
 * TParams: 생성 파라미터 타입 (없으면 void)
 *
 * See: docs/adding-chart-indicator.md
 */
export interface ChartIndicator<TData, TParams = void> {
    id: string;
    label: string;
    defaultParams?: TParams;
    /** chart 인스턴스에 시리즈·프라이스라인 등을 부착하고 핸들 반환 */
    attach(chart: IChartApi, params: TParams): IndicatorHandle;
    /** 데이터 변경 시 핸들을 통해 업데이트 */
    update(handle: IndicatorHandle, data: TData): void;
    /** 언마운트 또는 지표 제거 시 cleanup */
    detach(handle: IndicatorHandle, chart: IChartApi): void;
}

/** 일봉 차트 지표 데이터 */
export interface DailyIndicatorData {
    candles: ChartCandle[];
}

/** 분봉 차트 지표 데이터 */
export interface MinuteIndicatorData {
    candles: ChartCandle[];
    markerTime?: number | null;
}
