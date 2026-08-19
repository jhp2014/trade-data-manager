// MasterCache — 종목 마스터 메모리 캐시(**날짜무관**). StockMasterReader 위 누적 캐시 데코레이터.
// 코드 배치 중 캐시에 없는 것만 조회해 누적(과거 마스터는 안 변함). 신규상장 등은 refresh() 로 비운다.
import type { StockMaster, StockMasterMeta, StockMasterReader } from "@trade-data-manager/market";

export class MasterCache {
    // null = 조회했으나 없는 코드(폐지·미수집). 음성 캐시로 매 빌드 재조회를 막는다(refresh 로 함께 비움).
    private readonly cache = new Map<string, StockMaster | null>();
    // 이름표 전량(`/stocks/master`) — 코드별 캐시와 **별도 슬롯**이다. 위 캐시는 코드로 찾는 것이라
    // "전부 다 들었나"를 말할 수 없고(음성 캐시가 섞여 개수로도 못 센다), 그 판정을 지어내면 신규상장이
    // 조용히 빠진다. 무효화는 refresh() 한 곳이 둘 다 비운다 — 갱신 지점이 둘이면 한쪽만 낡는다.
    private allMeta: StockMasterMeta[] | null = null;
    /** 전량 목록 in-flight 공유 — 부팅 직후 패널 여럿이 동시에 열려도 전량 조회는 한 번. */
    private allMetaInFlight: Promise<StockMasterMeta[]> | null = null;
    // refresh 세대 — 조회 **도중** refresh 가 끼면 그 결과는 옛 스냅샷이다. 이번 호출자에게는 주되
    // 캐시에 다시 꽂지 않는다(`??=` 시절엔 refresh 뒤 도착한 옛 결과가 캐시로 굳어 재시작까지 낡았다).
    private generation = 0;

    constructor(private readonly inner: StockMasterReader) {}

    /** 코드 배치 → 마스터. 미조회 코드만 inner 호출·누적(없는 코드도 null 로 기록해 다음 배치에서 재조회 안 함). */
    async getByStockCodes(codes: string[]): Promise<StockMaster[]> {
        // 조회 전에 값을 스냅해 둔다 — 아래 await 사이 refresh 가 캐시를 비워도 이번 응답은 온전해야 한다.
        const resolved = new Map<string, StockMaster | null>();
        for (const c of codes) {
            const hit = this.cache.get(c);
            if (hit !== undefined) resolved.set(c, hit);
        }
        const missing = codes.filter((c) => !resolved.has(c));
        if (missing.length > 0) {
            const gen = this.generation;
            const fetched = await this.inner.getByStockCodes(missing);
            const found = new Set(fetched.map((m) => m.stockCode));
            for (const m of fetched) resolved.set(m.stockCode, m);
            for (const c of missing) if (!found.has(c)) resolved.set(c, null); // 없음도 기록(재조회 방지)
            if (gen === this.generation) for (const c of missing) this.cache.set(c, resolved.get(c) ?? null);
        }
        return codes.map((c) => resolved.get(c) ?? null).filter((m): m is StockMaster => m !== null);
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

    /** 이름표 전량 — 한 번 읽어 들고 있는다(마스터는 수집 때만 바뀐다). 동시 cold 는 한 조회를 나눠 받는다. */
    listAllMeta(): Promise<StockMasterMeta[]> {
        if (this.allMeta) return Promise.resolve(this.allMeta);
        if (!this.allMetaInFlight) {
            const gen = this.generation;
            const p = this.inner
                .listAllMeta()
                .then((meta) => {
                    if (gen === this.generation) this.allMeta = meta; // 조회 중 refresh — 옛 스냅샷은 안 굳힘
                    return meta;
                })
                .finally(() => {
                    if (this.allMetaInFlight === p) this.allMetaInFlight = null;
                });
            this.allMetaInFlight = p;
        }
        return this.allMetaInFlight;
    }

    /** 신규상장 등 마스터 갱신 시 캐시 비움(음성 캐시·전량 목록 포함 → 새로 조회). 진행 중 조회 결과도 안 굳힌다. */
    refresh(): void {
        this.generation++;
        this.cache.clear();
        this.allMeta = null;
    }
}
