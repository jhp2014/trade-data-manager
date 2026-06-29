import type { StockMaster } from "../../../../domain/index.js";

/**
 * 종목 마스터 영속화(ISP). **upsert-accumulate: 절대 삭제 안 함** → 폐지종목 행도 보존(과거 복기 표시용).
 * 유니버스 갱신은 name·market·listingDate 만 덮고 **ipoPrice 는 보존**한다
 * (별도 enrichment 가 채운 공모가를 라이브 갱신이 null 로 지우지 않게).
 */
export interface StockMasterRepository {
    saveStockMasters(masters: StockMaster[]): Promise<void>;
}
