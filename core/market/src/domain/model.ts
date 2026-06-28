// core/market/domain — 순수 도메인 모델(외부 import 0).
// "가장 변하지 않는 본질"만 담는다: OHLCV + 식별자/시각. 파생값(등락률·거래대금·누적)은
// 모델 필드가 아니라 price.ts 의 순수함수로 계산한다. 저장/조회 최적화(id·중복·평탄화)는
// DB(infra/db) 의 관심사이지 도메인의 관심사가 아니다.
//
// 모든 가격/수량 필드는 무손실 string(계산은 내부에서 BigInt). 반올림/절삭은 표현계층에서만.

/** 시장 구분. UN = 통합(KRX+NXT). */
export type Market = "KRX" | "UN";

/** 일봉 한 시장의 바. amount(거래대금)는 일봉 소스(키움)가 내려주는 원본 값. */
export interface DailyBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    amount: string;
}

/** 분봉 한 시장의 바. amount/누적은 보관하지 않고 price.ts 로 계산한다. */
export interface MinuteBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

/** 한 종목·한 거래일의 일봉. KRX·UN 두 바를 함께 가진다. */
export interface DailyCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    krx: DailyBar;
    un: DailyBar;
    /** 전일종가(등락률 기준). 소스가 캔들과 함께 내려주는 값. 없으면 null. */
    prevClose: { krx: string | null; un: string | null };
}

/** 한 종목·한 거래일·한 시각의 분봉. KRX·UN 두 바를 함께 가진다. */
export interface MinuteCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    krx: MinuteBar;
    un: MinuteBar;
}
