import type { StockMaster } from "#domain";

/**
 * 종목 마스터 코드배치 조회(query) — universe 코드 → 마스터 stitch(1차 분류 서비스).
 * 없는 코드는 결과에서 빠진다(폐지·미수집). 순서·완전성 보장 안 함 — 호출자가 code 로 맞춘다.
 */
export interface StockMasterReader {
    getByStockCodes(codes: string[]): Promise<StockMaster[]>;
}
