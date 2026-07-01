// DaySummaryService — 날짜 → 그날 universe 종목들의 당일 요약(DaySummary). 시작점 read 서비스.
// universe 주도 루프: 시트에 없는 종목도 스냅샷으로(미분류), 누락 없음.
// 여러 소스(시트·master·시총·일봉·전일종가·이슈)를 stock_code 로 메모리 조인 → DailySnapshot[] → buildDaySummary.
// 차트(분봉)·순위·필터는 클라 몫 — 여긴 스칼라 스냅샷까지만 stitch(종가 순위는 무의미, 차트 필요).
import type {
    DailyUniverseProvider,
    ThemeMembershipProvider,
    StockMasterRepository,
    DailyMarketCapRepository,
    DailyCandleSnapshotReader,
    DailyIssueRepository,
} from "#port/outbound";
import type { DailySnapshot, DaySummary, DaySummaryReader, IssueTag, ThemeTag } from "#port/inbound";
import { buildDaySummary } from "./daySummary.js";

export interface DaySummaryDeps {
    universe: DailyUniverseProvider;
    membership: ThemeMembershipProvider;
    stockMaster: StockMasterRepository;
    marketCap: DailyMarketCapRepository;
    dailyCandle: DailyCandleSnapshotReader;
    dailyIssue: DailyIssueRepository;
}

export class DaySummaryService implements DaySummaryReader {
    constructor(private readonly deps: DaySummaryDeps) {}

    async summaryByDate(date: string): Promise<DaySummary> {
        const { universe, membership, stockMaster, marketCap, dailyCandle, dailyIssue } = this.deps;
        const codes = await universe.stockCodesByDate(date);
        if (codes.length === 0) return buildDaySummary(date, []); // 그날 분봉 없음 → 다른 조회 생략

        const universeSet = new Set(codes);
        const members = await membership.load();
        // universe 교집합 멤버 → 종목별 ThemeTag[](편입이슈·날짜 메타 보존). 멤버 등장순서 유지.
        const themeTagsByCode = new Map<string, ThemeTag[]>();
        for (const m of members) {
            if (!universeSet.has(m.code)) continue;
            const tag: ThemeTag = { theme: m.theme };
            if (m.issue) tag.admissionIssue = m.issue;
            if (m.date) tag.admissionDate = m.date;
            const arr = themeTagsByCode.get(m.code);
            if (arr) arr.push(tag);
            else themeTagsByCode.set(m.code, [tag]);
        }

        const [masters, caps, candles, prevCloses, issues] = await Promise.all([
            stockMaster.getByStockCodes(codes),
            marketCap.getByDateAndCodes(date, codes),
            dailyCandle.getByDateAndCodes(date, codes),
            dailyCandle.getPreviousCloses(date, codes),
            dailyIssue.getByDate(date),
        ]);

        const masterByCode = new Map(masters.map((m) => [m.stockCode, m]));
        const capByCode = new Map(caps.map((c) => [c.stockCode, c.marketCap]));
        const candleByCode = new Map(candles.map((c) => [c.stockCode, c]));
        const prevByCode = new Map(prevCloses.map((p) => [p.stockCode, p]));
        const issueTagsByCode = new Map<string, IssueTag[]>();
        for (const i of issues) {
            const tag: IssueTag = { issue: i.issue, author: i.author };
            if (i.comment !== undefined) tag.comment = i.comment;
            const arr = issueTagsByCode.get(i.stockCode);
            if (arr) arr.push(tag);
            else issueTagsByCode.set(i.stockCode, [tag]);
        }

        const stocks: DailySnapshot[] = codes.map((code) => {
            const master = masterByCode.get(code);
            const prev = prevByCode.get(code);
            return {
                date,
                stockCode: code,
                name: master?.name ?? null,
                market: master?.market ?? null,
                candle: candleByCode.get(code) ?? null,
                prevCloseKrx: prev?.krxClose ?? null,
                prevCloseUn: prev?.unClose ?? null,
                marketCap: capByCode.get(code) ?? null,
                themes: themeTagsByCode.get(code) ?? [],
                issues: issueTagsByCode.get(code) ?? [],
            };
        });

        return buildDaySummary(date, stocks);
    }
}
