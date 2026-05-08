/* lightweight-charts 시계열 한 봉. time은 unix seconds, KST 기준 */
export interface ChartCandle {
    time: number; // unix seconds (UTC)
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    amount?: number;
    accAmount?: number;
    prevCloseKrx?: number;
    prevCloseNxt?: number;
}

/** 오버레이 시리즈의 한 시점 데이터 (closeRateNxt 기준) */
export interface ChartOverlayPoint {
    time: number;
    value: number;     // closeRateNxt (%)
    amount: number;    // trading_amount (원)
    cumAmount: number; // cumulative_trading_amount (원)
}

/** lightweight-charts Line 시리즈용 단순 시계열 포인트 */
export interface ChartLinePoint {
    time: number;
    value: number;
}

/** 테마 오버레이의 종목 단위 시리즈 */
export interface ChartOverlaySeries {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
    series: ChartOverlayPoint[];
}

/** fetchChartPreviewAction이 반환하는 차트 전체 DTO */
export interface ChartPreviewDTO {
    daily: ChartCandle[];
    minute: ChartCandle[];
    themeOverlay: ChartOverlaySeries[];
    markerTime: number | null;
}
