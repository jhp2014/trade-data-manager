// MasterCache — 종목 마스터 메모리 캐시(**날짜무관**). StockMasterReader 위 누적 캐시 데코레이터.
// 코드 배치 중 캐시에 없는 것만 조회해 누적(과거 마스터는 안 변함). 신규상장 등은 refresh() 로 비운다.
import type { StockMaster, StockMasterReader } from "@trade-data-manager/market";

export class MasterCache {
    private readonly cache = new Map<string, StockMaster>();

    constructor(private readonly inner: StockMasterReader) {}

    /** 코드 배치 → 마스터. 미캐시 코드만 조회·누적. 없는 코드(폐지·미수집)는 결과에서 빠진다. */
    async getByStockCodes(codes: string[]): Promise<StockMaster[]> {
        const missing = codes.filter((c) => !this.cache.has(c));
        if (missing.length > 0) {
            const fetched = await this.inner.getByStockCodes(missing);
            for (const m of fetched) this.cache.set(m.stockCode, m);
        }
        return codes.map((c) => this.cache.get(c)).filter((m): m is StockMaster => m !== undefined);
    }

    /** 신규상장 등 마스터 갱신 시 캐시 비움. */
    refresh(): void {
        this.cache.clear();
    }
}
