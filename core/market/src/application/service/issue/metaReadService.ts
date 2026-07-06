// MetaReadService — MetaReader(inbound) 구현. universe → 불변 meta(시트·master·시총·일봉·전일종가) fetch → assembleBaseSnapshots.
// issues 는 뺀다(가변). 캐시 무지 — 메모리 LRU 는 apps/api 어댑터(MetaStore)가 이 위에 씌운다. 멤버십 캐시는 어댑터가 주입.
import type {
    DailyUniverseProvider,
    ThemeMembershipProvider,
    StockMasterReader,
    DailyMarketCapReader,
    DailyCandleSnapshotReader,
} from "#port/query";
import type { MetaReader, DailySnapshot } from "#port/query";
import { assembleBaseSnapshots } from "./daySummary.js";

export interface MetaReadDeps {
    universe: DailyUniverseProvider;
    membership: ThemeMembershipProvider;
    stockMaster: StockMasterReader;
    marketCap: DailyMarketCapReader;
    dailyCandle: DailyCandleSnapshotReader;
}

export class MetaReadService implements MetaReader {
    constructor(private readonly deps: MetaReadDeps) {}

    async metaByDate(date: string): Promise<DailySnapshot[]> {
        const { universe, membership, stockMaster, marketCap, dailyCandle } = this.deps;
        const codes = await universe.stockCodesByDate(date);
        if (codes.length === 0) return [];
        const [members, masters, caps, candles, prevCloses] = await Promise.all([
            membership.load(),
            stockMaster.getByStockCodes(codes),
            marketCap.getByDateAndCodes(date, codes),
            dailyCandle.getByDateAndCodes(date, codes),
            dailyCandle.getPreviousCloses(date, codes),
        ]);
        return assembleBaseSnapshots(date, codes, { members, masters, caps, candles, prevCloses });
    }
}
