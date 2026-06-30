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

/**
 * 한 종목·한 거래일의 일봉. KRX·UN 두 바를 가진다.
 * 등락률 기준가(전일종가)는 모델에 두지 않는다 — 직전 거래일 캔들의 close 를
 * 애플리케이션/리포지토리가 조회해 계산(computeChangeRate)에 넣는다.
 * (소스 prevClose 는 KIS=KRX 고정·키움=조회모드별 상이라 신뢰 불가. 우리 직전 캔들에서
 *  시장별로 파생하는 편이 일관·정확하다.)
 */
export interface DailyCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    krx: DailyBar;
    un: DailyBar;
}

/**
 * 한 종목·한 거래일·한 시각의 분봉. UN(통합) 바는 항상 존재(UN ⊇ KRX).
 * krx 는 null 가능 — NXT 단독 거래시간(정규장 전 프리마켓 08:00~09:00, 정규장 후 시간외)엔
 * KRX 세션이 없어 KRX 바가 구조적으로 부재한다. 소비자는 krx===null 이면 KRX 계산을 건너뛴다.
 */
export interface MinuteCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    krx: MinuteBar | null;
    un: MinuteBar;
}
