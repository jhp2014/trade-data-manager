// DaySummaryService — 날짜 → 그날 universe 종목들의 당일 요약(DaySummary). 시작점 read 서비스.
// fetch(시트·master·시총·일봉·전일종가·이슈)만 하고 조립은 순수함수(assembleBaseSnapshots·applyIssues·buildDaySummary)에 위임.
// universe 주도: 시트에 없는 종목도 스냅샷으로(미분류), 누락 없음. 순위/필터/차트는 클라 몫.
// (apps/api 는 meta 를 MetaStore 캐시로 받아 같은 순수함수로 조립 — 이 클래스는 uncached 경로/probe 용.)
import type {
    DailyUniverseProvider,
    ThemeMembershipProvider,
    StockMasterReader,
    DailyMarketCapReader,
    DailyCandleSnapshotReader,
    DailyIssueRepository,
} from "#port/query";
import type { DaySummary, DaySummaryReader } from "#port/query";
import { buildDaySummary, assembleBaseSnapshots, applyIssues } from "./daySummary.js";

export interface DaySummaryDeps {
    universe: DailyUniverseProvider;
    membership: ThemeMembershipProvider;
    stockMaster: StockMasterReader;
    marketCap: DailyMarketCapReader;
    dailyCandle: DailyCandleSnapshotReader;
    dailyIssue: DailyIssueRepository;
}

export class DaySummaryService implements DaySummaryReader {
    constructor(private readonly deps: DaySummaryDeps) {}

    async summaryByDate(date: string): Promise<DaySummary> {
        const { universe, membership, stockMaster, marketCap, dailyCandle, dailyIssue } = this.deps;
        const codes = await universe.stockCodesByDate(date);
        if (codes.length === 0) return buildDaySummary(date, []); // 그날 분봉 없음 → 다른 조회 생략

        const [members, masters, caps, candles, prevCloses, issues] = await Promise.all([
            membership.load(),
            stockMaster.getByStockCodes(codes),
            marketCap.getByDateAndCodes(date, codes),
            dailyCandle.getByDateAndCodes(date, codes),
            dailyCandle.getPreviousCloses(date, codes),
            dailyIssue.getByDate(date),
        ]);

        const base = assembleBaseSnapshots(date, codes, { members, masters, caps, candles, prevCloses });
        return buildDaySummary(date, applyIssues(base, issues));
    }
}
