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

/** review_target 의 Point List 한 점 (탐색용). payload = m_/feature 값. */
export interface ChartReviewPoint {
    reviewId: string;
    tradeTime: string;
    payload: Record<string, string | string[]>;
}

/**
 * 종목 1개의 오버레이 시리즈 + 탐색용 풀데이터.
 * 테마 번들이 이미 모든 멤버의 raw 차트/리뷰를 내려주므로(getThemeBundle),
 * 멤버를 클릭해 탐색할 때 추가 요청 없이 이 시리즈만으로 차트/Point List 를 그린다.
 */
export interface ChartOverlaySeries {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
    series: ChartOverlayPoint[];
    /** 이 멤버의 일봉 raw (메인 일봉 차트용). prevClose 도 여기서 파생. */
    daily: DailyCandle[];
    /** 이 멤버의 분봉 raw (메인 분봉 차트용). */
    minute: MinuteCandle[];
    /** 차트에 그릴 가격선들(review_target.lineTargets). 없으면 []. */
    lineTargets: number[];
    /** 이 멤버의 Point List. review_target 아니면 []. */
    reviewPoints: ChartReviewPoint[];
    /** 같은 거래일의 review_target 이면 true(포인트 0개여도). 입력 가능 여부·3-state 배지용. */
    isReviewTarget: boolean;
    /** review_target 이고 포인트가 1개 이상이면 true. 배지용. */
    hasReview?: boolean;
    /** 이 거래일이 이 종목의 상장일이면 true(등락률이 시가 기준으로 보정됨). */
    isListingDay: boolean;
    /** 당일 첫 분봉 시가(raw). 상장일 % 기준값으로 쓴다. 분봉 없으면 null. */
    firstMinuteOpen: number | null;
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
    /**
     * 진입일 분봉 가격 라인 % 변환의 기준값.
     * 보통은 전일종가(prevClose). 단 상장일(isListingDay)에는 전일종가가 없어
     * 당일 첫 분봉 시가로 대체된다(= 분봉 캔들 등락률과 같은 기준).
     */
    prevCloseKrx: number | null;
    prevCloseNxt: number | null;
    /** 요청 종목의 이 거래일이 상장일이면 true. 헤더 배지·기준선 의미 표시용. */
    isListingDay: boolean;
    /** 테마별로 묶인 오버레이 시리즈들. 모달은 themeId 매칭해서 하나만 골라 사용. */
    themes: ChartThemeOverlay[];
}
