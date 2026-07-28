// MasterCache — 종목 마스터 메모리 캐시(**날짜무관**). StockMasterReader 위 누적 캐시 데코레이터.
// 코드 배치 중 캐시에 없는 것만 조회해 누적(과거 마스터는 안 변함). 신규상장 등은 refresh() 로 비운다.
import type { StockMaster, StockMasterReader } from "@trade-data-manager/market";

export class MasterCache {
    // null = 조회했으나 없는 코드(폐지·미수집). 음성 캐시로 매 빌드 재조회를 막는다(refresh 로 함께 비움).
    private readonly cache = new Map<string, StockMaster | null>();

    constructor(private readonly inner: StockMasterReader) {}

    /** 코드 배치 → 마스터. 미조회 코드만 inner 호출·누적(없는 코드도 null 로 기록해 다음 배치에서 재조회 안 함). */
    async getByStockCodes(codes: string[]): Promise<StockMaster[]> {
        const missing = codes.filter((c) => !this.cache.has(c));
        if (missing.length > 0) {
            const fetched = await this.inner.getByStockCodes(missing);
            const found = new Set(fetched.map((m) => m.stockCode));
            for (const m of fetched) this.cache.set(m.stockCode, m);
            for (const c of missing) if (!found.has(c)) this.cache.set(c, null); // 없음도 캐시(재조회 방지)
        }
        return codes.map((c) => this.cache.get(c) ?? null).filter((m): m is StockMaster => m !== null);
    }

    /**
     * 행들에 종목명을 붙인다 — 큐레이션 산출물(가격선·타점)은 curation DB, 종목명은 market.stock_master 라
     * **물리 분리 시 SQL 조인이 불가**하다. 그 조인을 앱레이어에서 하는 자리가 여기 한 곳.
     * 미수집·폐지 코드는 name=null(행은 살린다 — 이름 없다고 작업셋에서 사라지면 안 된다).
     */
    async attachNames<T extends { stockCode: string }>(rows: T[]): Promise<(T & { name: string | null })[]> {
        const masters = await this.getByStockCodes([...new Set(rows.map((r) => r.stockCode))]);
        const nameByCode = new Map(masters.map((m) => [m.stockCode, m.name] as const));
        return rows.map((r) => ({ ...r, name: nameByCode.get(r.stockCode) ?? null }));
    }

    /** 신규상장 등 마스터 갱신 시 캐시 비움(음성 캐시 포함 → 새로 조회). */
    refresh(): void {
        this.cache.clear();
    }
}
