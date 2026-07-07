// /stocks/meta 계약 — 종목 메타(이름·시장) 경량 조회. 이름 하나 얻으려 큰 보드 응답(day-summary)을 당기지 않기 위한 것.
export interface StockMeta {
    stockCode: string;
    name: string;
    market: string; // "거래소"(코스피) | "코스닥"
}
