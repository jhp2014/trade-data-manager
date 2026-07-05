// Inbound(driving) 포트 — 공모가 enrichment(유니버스, 쓰기).
// 실행 시점 기준 최근 1년 상장 & ipoPrice 빈 종목만 list-info 에서 공모가를 추출해 stock_master 에 채운다.
// 단일종목 추출은 내부 협력자(IpoPriceBackfillService)가, 이 유스케이스는 대상 선별 + fan-out 을 책임.

export interface IpoPriceEnrichResult {
    /** 대상(최근 상장 & 공모가 null) 종목 수. */
    needing: number;
    /** 공모가를 실제로 채운 종목 수(상장일 유상증자 행 있던 것). */
    filled: number;
    /** 실패한 종목 코드. */
    failed: string[];
}

export interface IpoPriceEnricher {
    /** 최근 1년 상장 종목 중 공모가 빈 것을 채운다(종목 실패 격리). */
    enrichAll(): Promise<IpoPriceEnrichResult>;
}
