import type { StockMaster } from "#domain";

/** 종목 마스터의 **이름표 부분**만 — 이름을 아는 데 공모가·상장일까지 끌 이유가 없다(ISP). */
export interface StockMasterMeta {
    stockCode: string;
    name: string;
    market: string;
}

/**
 * 종목 마스터 조회(query) — universe 코드 → 마스터 stitch(1차 분류 서비스).
 * 없는 코드는 결과에서 빠진다(폐지·미수집). 순서·완전성 보장 안 함 — 호출자가 code 로 맞춘다.
 */
export interface StockMasterReader {
    getByStockCodes(codes: string[]): Promise<StockMaster[]>;
    /**
     * 이름표 **전량**. 앱대면 화면이 종목명을 조회 없이 답하려고 통째로 받아 가는 자리다
     * (코드 목록을 모아 묻는 방식이 "모으는 쪽이 자기 피드만 안다"는 이유로 이름을 빠뜨렸다).
     * 수천 행 규모라 페이지네이션을 두지 않는다 — 나눌 만큼 크지 않고, 나누면 부분만 든 캐시가 생긴다.
     */
    listAllMeta(): Promise<StockMasterMeta[]>;
}
