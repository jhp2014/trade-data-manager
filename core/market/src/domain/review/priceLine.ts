// core/market/domain/review — 차트 주석(사람 편집). 수집이 아니라 큐레이션.
// price line: 한 종목·거래일 차트에 그은 수평 가격선. (종목,날짜) 당 N개.
// price 가 draggable(가변)이라 불변 자연키가 없다 → surrogate id(영속 부기). 도메인은 신규 생성 시 id 를 모른다.
// 가격은 무손실 string 계약(원). 저장 최적화(integer)는 DB(infra) 관심사.

/** 한 종목·거래일 차트의 수평 가격선 1개. */
export interface PriceLine {
    id?: string; // surrogate(bigint). 신규(미저장)면 undefined, 조회/저장 후면 존재.
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    price: string; // 원(₩) 가격레벨. 무손실 string(DB integer 는 매퍼 경계에서만).
    memo?: string; // 선의 의미(선택)
}
