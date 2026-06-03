import type { MinuteCandle } from "@trade-data-manager/chart-utils";

/** 분봉 1개. KRX/NXT 등락률(%) 데이터 통합. SSOT: @trade-data-manager/chart-utils */
export type { MinuteCandle };

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
    /** 같은 거래일의 review_target(Point List 보유) 종목이면 true. 배지용. */
    hasReview?: boolean;
}

/** 테마 1개에 속한 멤버들의 오버레이 묶음 */
export interface ChartThemeOverlay {
    themeId: string;
    themeName: string;
    /** self 포함. 이 테마에 속한 종목들의 오버레이 시리즈 */
    overlaySeries: ChartOverlaySeries[];
}

/**
 * 차트 미리보기 응답 DTO.
 * daily/minute 는 요청 종목(=요청 (code,date) 멤버)의 메인차트용 raw 시계열.
 * 호출자가 이미 요청 종목을 알므로 selfStockCode/selfStockName 같은 식별 필드는 두지 않는다.
 */
export interface ChartPreviewDTO {
    /** 요청 종목의 일봉 시계열 (메인 차트용) */
    daily: DailyCandle[];
    /** 요청 종목의 분봉 시계열 (메인 차트용) */
    minute: MinuteCandle[];
    /** 진입일 prevClose. 분봉 가격 라인 % 변환의 기준 */
    prevCloseKrx: number | null;
    prevCloseNxt: number | null;
    /** 테마별로 묶인 오버레이 시리즈들. 모달은 themeId 매칭해서 하나만 골라 사용. */
    themes: ChartThemeOverlay[];
}
