// Inbound(driving) 포트 — 공모가 백필(일회성 enrichment, 쓰기).
// 상장일이 알려진 종목의 공모가를 list-info 에서 추출해 stock_master.ipoPrice 에 채운다.
// 시총 백필과 같은 소스(getListInfo)지만 저장 대상(stock_master)·관심사가 달라 별도 유스케이스로 둔다.

export interface IpoPriceBackfillResult {
    stockCode: string;
    listingDate: string;
    /** 추출한 공모가(원). 상장일 유상증자 행이 없으면 null. */
    ipoPrice: string | null;
}

export interface IpoPriceBackfiller {
    /** 상장일 기준으로 공모가를 추출해 채운다. */
    backfill(stockCode: string, listingDate: string): Promise<IpoPriceBackfillResult>;
}
