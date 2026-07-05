import type { StockMaster } from "#domain";

/**
 * 종목 마스터 영속화(ISP). **upsert-accumulate: 절대 삭제 안 함** → 폐지종목 행도 보존(과거 복기 표시용).
 * 유니버스 갱신은 name·market·listingDate 만 덮고 **ipoPrice 는 보존**한다
 * (별도 enrichment 가 채운 공모가를 라이브 갱신이 null 로 지우지 않게).
 */
export interface StockMasterRepository {
    saveStockMasters(masters: StockMaster[]): Promise<void>;
    /**
     * 공모가 enrichment — list-info 가 구한 공모가만 채운다(name·market·listingDate 등 다른 필드 불변).
     * saveStockMasters 가 ipoPrice 를 보존만 하고 비워두던 그 자리를 이 메서드가 채운다.
     */
    updateIpoPrice(stockCode: string, ipoPrice: string): Promise<void>;
    /**
     * 코드 배치로 마스터 조회(이 repo 의 첫 read). 1차 분류 서비스가 universe 코드 → 마스터 stitch 용.
     * 없는 코드는 결과에서 빠진다(폐지·미수집). 순서·완전성 보장 안 함 — 호출자가 code 로 맞춘다.
     */
    getByStockCodes(codes: string[]): Promise<StockMaster[]>;
    /**
     * 공모가 enrichment 대상 — ipoPrice 가 비었고 listingDate ≥ listedSince 인 종목(listingDate 오름차순).
     * 실행 시점 기준 최근 상장만 채운다(오래된 종목·list-info 커버리지 밖 제외 → 대상 소수).
     */
    listNeedingIpoPrice(listedSince: string): Promise<{ stockCode: string; listingDate: string }[]>;
}
