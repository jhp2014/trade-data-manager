// core/market/domain/equity/dailyStockStat — (종목, 날)의 일별 속성 1행. 값객체뿐(계산 없음).
//
// 우리가 만들지 않고 **KRX 일별매매정보에서 받아 적는** 값이다. 발행주식수 이벤트로 주식수를 역산하던
// 옛 경로는 재상장류(액면분할·병합·감자)에서 원리적으로 복원이 불가능해 폐기됐다
// — decisions.md 「시가총액·상장주식수 소스 (KRX)」 절.
// (수집 결과 타입 DailyStatCollectResult 는 여기 없다 — 관례대로 inbound 포트 파일에 산다.
//  MissingStatFill 은 inbound·outbound 양쪽이 쓰는 값객체라 여기 둔다 — 포트끼리 물게 하면
//  driving→driven 방향 의존이 생긴다.)

/** (종목, 날) 일별 속성 1행. 수치는 무손실 string. */
export interface DailyStockStat {
    stockCode: string;
    /** 거래일 YYYY-MM-DD. */
    date: string;
    /** 시가총액(원) = 그 날 종가 × 그 날 상장주식수. **당일** 기준(읽는 쪽이 D-1 행을 봐서 시점을 맞춘다). */
    marketCap: string;
    /** 상장주식수(주). */
    listShares: string;
    /** 소속부 원문("중견기업부"·"관리종목(소속부없음)" 등). KOSPI 는 빈값이라 null. 파싱하지 않는다. */
    sectTpNm: string | null;
}

/**
 * 시총 읽기 계약 — 소비자(축·보드)가 필요로 하는 건 시총 하나라 ISP 로 좁혀 둔다.
 * `date` 는 **그 행의 거래일**이다(읽는 쪽이 D-1 행을 요청하면 직전 거래일이 담겨 온다).
 */
export interface DailyMarketCap {
    stockCode: string;
    date: string;
    /** 원(₩) 무손실. */
    marketCap: string;
}

/**
 * 소스가 안 준 거래분(그날 일봉은 있는데 행이 안 온 (종목,날))을 어떻게 처리했는지.
 *
 * 채우는 조건이 좁은 이유: 승계는 "그날 주식수가 안 바뀌었다"를 가정하는데, 그게 보장되는 건
 * **그 종목의 마지막 거래일**(상장폐지·스팩 소멸)뿐이다. 중간 구멍은 재상장 당일일 수 있고 그날이
 * 바로 주식수가 바뀌는 날이라 승계하면 틀린 값을 조용히 넣게 된다 → 안 채우고 센다.
 */
export interface MissingStatFill {
    /** 승계로 채운 행 수(그 종목의 마지막 거래일 — 주식수 불변이 보장되는 자리). */
    inherited: number;
    /** 못 채운 구멍(중간 구멍·수집 실패일 등) — 0 이 아니면 손으로 봐야 한다. */
    unresolved: number;
}
