// core/market/domain/review — 차트 주석(사람 편집). 수집이 아니라 큐레이션.
// price line: 한 종목·거래일 차트에 그은 수평 가격선. (종목,날짜) 당 N개.
//
// **가격을 저장하지 않는다** — 항상 어떤 캔들의 값(보통 고가)에 긋기 때문에, 가격 대신 **앵커(캔들 좌표)**만
// 저장하고 표시 시점에 그 캔들에서 값을 읽는다. 이점: 수정계수가 바뀌어(권리락/배당락/액분) 캔들 스케일이
// 달라져도 선이 자동으로 따라간다(가격 재수정 불필요). 앵커 종류는 anchorTime 유무로 구분 —
// 없으면 **일봉** 앵커(anchorDate 만), 있으면 **분봉** 앵커(anchorDate + anchorTime).
// field = 그 캔들에서 읽을 값(고/저/시/종, 기본 high) — 확장 여지.

/** 앵커 캔들에서 읽을 값. */
export type PriceLineField = "high" | "low" | "open" | "close";

/** 한 종목·거래일 차트의 수평 가격선 1개(앵커 기반). */
export interface PriceLine {
    id?: string; // surrogate(bigint). 신규(미저장)면 undefined, 조회/저장 후면 존재.
    stockCode: string;
    date: string; // YYYY-MM-DD — 이 선이 속한 차트(로드 단위). 앵커 날짜와 다를 수 있음.
    anchorDate: string; // YYYY-MM-DD — 값을 읽어올 앵커 캔들의 거래일.
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 앵커, 없으면 일봉 앵커.
    field: PriceLineField; // 앵커 캔들에서 읽을 값(기본 high).
    memo?: string; // 선의 의미(선택).
}
