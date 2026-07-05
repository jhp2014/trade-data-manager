// MetaStore — 당일 **불변 meta**(시트·master·시총·일봉·전일종가) fetch + 거래일 LRU 캐시.
// baseSnapshots(issues=[])를 조립해 캐시 → 테마·복기 두 엔드포인트가 공유(시트·master·cap 1× 조회).
// issues 는 자주 편집이라 캐시 밖 — 엔드포인트가 fresh 조회해 applyIssues 로 덮는다.
// 시트 멤버십은 date-무관이라 프로세스 1회 캐시(refresh 훅). 조립은 core 순수함수(assembleBaseSnapshots).
import { assembleBaseSnapshots } from "@trade-data-manager/market";
import type { DailySnapshot, StockMaster, DailyMarketCap, DailyCandle, PreviousClose, ThemeMember } from "@trade-data-manager/market";

/** 거래일 LRU 상한. baseSnapshots 는 스칼라 스냅샷이라 작아 넉넉히 잡아도 무해. */
const MAX_DAYS = 90;

/** 필요한 메서드만 구조적으로 요구(Drizzle repo·시트 어댑터가 그대로 만족). */
export interface MetaStoreDeps {
    universe: { stockCodesByDate(date: string): Promise<string[]> };
    membership: { load(): Promise<ThemeMember[]> };
    stockMaster: { getByStockCodes(codes: string[]): Promise<StockMaster[]> };
    marketCap: { getByDateAndCodes(date: string, codes: string[]): Promise<DailyMarketCap[]> };
    dailyCandle: {
        getByDateAndCodes(date: string, codes: string[]): Promise<DailyCandle[]>;
        getPreviousCloses(date: string, codes: string[]): Promise<PreviousClose[]>;
    };
}

export class MetaStore {
    private membershipOnce: Promise<ThemeMember[]> | null = null;
    private readonly cache = new Map<string, DailySnapshot[]>(); // baseSnapshots(issues=[]) per date, 삽입순=LRU
    private readonly inFlight = new Map<string, Promise<DailySnapshot[]>>();

    constructor(private readonly deps: MetaStoreDeps) {}

    /** 시트 편집 후 멤버십·per-date 캐시 갱신 — 다음 요청이 재로드. */
    refresh(): void {
        this.membershipOnce = null;
        this.cache.clear();
    }

    /** date 의 불변 meta 스냅샷 스켈레톤(issues=[]). 캐시 hit 이면 즉시, 동시 cold 요청은 in-flight 공유. */
    async metaByDate(date: string): Promise<DailySnapshot[]> {
        const hit = this.cache.get(date);
        if (hit) {
            this.cache.delete(date);
            this.cache.set(date, hit); // LRU touch
            return hit;
        }
        const existing = this.inFlight.get(date);
        if (existing) return existing;
        const p = this.build(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        return p;
    }

    private members(): Promise<ThemeMember[]> {
        return (this.membershipOnce ??= this.deps.membership.load());
    }

    private async build(date: string): Promise<DailySnapshot[]> {
        const codes = await this.deps.universe.stockCodesByDate(date);
        if (codes.length === 0) {
            this.cache.set(date, []);
            return [];
        }
        const [members, masters, caps, candles, prevCloses] = await Promise.all([
            this.members(),
            this.deps.stockMaster.getByStockCodes(codes),
            this.deps.marketCap.getByDateAndCodes(date, codes),
            this.deps.dailyCandle.getByDateAndCodes(date, codes),
            this.deps.dailyCandle.getPreviousCloses(date, codes),
        ]);
        const base = assembleBaseSnapshots(date, codes, { members, masters, caps, candles, prevCloses });
        this.cache.set(date, base);
        while (this.cache.size > MAX_DAYS) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
        return base;
    }
}
