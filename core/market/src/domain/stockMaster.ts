// core/market/domain/stockMaster — 종목 마스터(준정적). 유니버스(ka10099) 1행 = 1종목.
// 순수 모델(외부 import 0). 시총·상장주식수는 여기 두지 않는다 — 시총은 별 테이블(원주가×역산shares)로 분리.
export interface StockMaster {
    stockCode: string;
    name: string;
    /** "거래소"(=코스피) | "코스닥". 개별주식만(ETF/ETN/리츠는 유니버스에서 이미 제외). */
    market: string;
    /** 상장일 YYYY-MM-DD. 미상/형식이상이면 null. */
    listingDate: string | null;
    /** 공모가(원). ka10099 엔 없어 수집 시 null — 별도 list-info enrichment 가 채운다. */
    ipoPrice: string | null;
}
