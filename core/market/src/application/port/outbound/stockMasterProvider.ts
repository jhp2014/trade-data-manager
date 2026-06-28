import type { StockMaster } from "../../../domain/index.js";

/**
 * 유니버스(현재 상장 중인 개별주식 전체) 라이브 조회 포트.
 * **폐지종목은 포함 안 됨** — 스윕 대상은 항상 라이브 소스에서 나온다(DB 의 누적 superset 이 아니라).
 * 구현은 키움 ka10099(코스피·코스닥 시장당 1콜, marketName 필터 내장).
 * ipoPrice 는 이 소스에 없어 null(별도 list-info enrichment 패스가 채움).
 */
export interface StockMasterProvider {
    listStockMasters(): Promise<StockMaster[]>;
}
