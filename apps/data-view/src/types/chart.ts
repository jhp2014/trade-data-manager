/** 일봉 1봉 — KRX/NXT 양쪽 가격 시리즈 보유 */
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

/** 분봉 1봉 — KRX/NXT 양쪽 등락률(%) 시리즈 보유 */
export interface MinuteCandle {
    time: number;
    krx: { open: number; high: number; low: number; close: number };  // 모두 % 단위
    nxt: { open: number; high: number; low: number; close: number };  // 모두 % 단위
    volume?: number;
    amount?: number;                    // KRW 단위 (DB trading_amount)
    accAmount?: number;                 // KRW 단위
}

/** 오버레이 1포인트 — KRX/NXT 양쪽 % */
export interface ChartOverlayPoint {
    time: number;
    valueKrx: number;
    valueNxt: number;
    amount: number;                     // 분 거래대금 KRW
    cumAmount: number;                  // 누적 거래대금 KRW
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
    daily: DailyCandle[];
    minute: MinuteCandle[];
    themeOverlay: ChartOverlaySeries[];
    markerTime: number | null;
    themes: Array<{ themeId: string; themeName: string }>;
    /** 진입일 일봉의 prevClose. 가격 라인의 분봉 % 변환 기준값으로 사용 */
    prevCloseKrx: number | null;
    prevCloseNxt: number | null;
}
