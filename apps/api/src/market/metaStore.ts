// MetaStore — MetaReader(core inbound 포트) 위에 씌운 **거래일 LRU 메모리 캐시 어댑터**.
// fetch·조립은 core MetaReadService 가 하고, 이 store 는 캐시만 소유(헥사고날: 앱이 inbound 포트 의존).
// baseSnapshots(issues=[])를 캐시 → 테마·복기 두 엔드포인트가 공유. issues 는 캐시 밖(엔드포인트가 fresh).
import type { MetaReader, DailySnapshot } from "@trade-data-manager/market";

/** 거래일 LRU 상한. baseSnapshots 는 스칼라 스냅샷이라 작아 넉넉히 잡아도 무해. */
const MAX_DAYS = 90;

export class MetaStore {
    private readonly cache = new Map<string, DailySnapshot[]>(); // 삽입순 = LRU
    private readonly inFlight = new Map<string, Promise<DailySnapshot[]>>();

    constructor(private readonly meta: MetaReader) {}

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

    private async build(date: string): Promise<DailySnapshot[]> {
        const base = await this.meta.metaByDate(date);
        this.cache.set(date, base);
        while (this.cache.size > MAX_DAYS) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
        return base;
    }
}
