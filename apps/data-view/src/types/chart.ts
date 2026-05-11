/** 일봉 1개. KRX/NXT 가격 데이터 통합 */
export interface DailyCandle {
    time: number;                       // unix seconds (UTC)
    krx: { open: number; high: number; low: number; close: number };
    nxt: { open: number; high: number; low: number; close: number };
    volumeKrx?: number;
    amountKrx?: number;                 // MIL 단위 (DB trading_amount_krx)
    volumeNxt?: number;
    amountNxt?: number;
    prevCloseKrx?: number;
    prevCloseNxt?: number;
}

/** 분봉 1개. KRX/NXT 등락률(%) 데이터 통합 */
export interface MinuteCandle {
    time: number;
    krx: { open: number; high: number; low: number; close: number };  // 모두 % 단위
    nxt: { open: number; high: number; low: number; close: number };  // 모두 % 단위
    volume?: number;
    amount?: number;                    // KRW 단위 (DB trading_amount)
    accAmount?: number;                 // KRW 단위 누적
}

/** 오버레이 1개. KRX/NXT 등락률 % 포함 */
export interface ChartOverlayPoint {
    time: number;
    valueKrx: number;
    valueNxt: number;
    amount: number;                     // 분봉 거래대금 KRW
    cumAmount: number;                  // 누적 거래대금 KRW
}

/** lightweight-charts Line 시리즈로 변환되는 시리즈 단위 */
export interface ChartLinePoint {
    time: number;
    value: number;
}

/** 종목 1개의 오버레이 시리즈 */
export interface ChartOverlaySeries {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
    series: ChartOverlayPoint[];
}

/** 테마 1개에 속한 멤버들의 오버레이 묶음 */
export interface ChartThemeOverlay {
    themeId: string;
    themeName: string;
    /** self 포함. 이 테마에 속한 종목들의 오버레이 시리즈 */
    overlaySeries: ChartOverlaySeries[];
}

/** fetchChartPreviewAction 의 응답 DTO */
export interface ChartPreviewDTO {
    /** self 종목의 일봉 시계열 (메인 차트용) */
    daily: DailyCandle[];
    /** self 종목의 분봉 시계열 (메인 차트용) */
    minute: MinuteCandle[];
    /** self 종목 자기 이름 */
    selfStockCode: string;
    selfStockName: string;
    /** 진입일 prevClose. 분봉 가격 라인 % 변환의 기준 */
    prevCloseKrx: number | null;
    prevCloseNxt: number | null;
    /** 테마별로 묶인 오버레이 시리즈들. 모달은 themeId 매칭해서 하나만 골라 사용. */
    themes: ChartThemeOverlay[];
}
