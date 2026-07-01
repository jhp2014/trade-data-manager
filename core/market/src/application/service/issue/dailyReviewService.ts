// DailyReviewService — 날짜 → 그날 universe 종목들의 검수 데이터(flat read-model). 시작점 서비스.
// universe 주도 루프: 시트에 없는 종목도 행으로(미분류), 누락 없음. 분류는 buildThemeIndex(themesOf) 한 스텝.
// 순위/뷰 셰이핑은 클라 몫(종가 순위는 무의미 → 차트 필요) — 여긴 데이터만 stitch.
import { buildThemeIndex, type DailyIssue } from "#domain";
import type {
    DailyUniverseProvider,
    ThemeMembershipProvider,
    StockMasterRepository,
    DailyMarketCapRepository,
    DailyIssueRepository,
} from "#port/outbound";
import type { DailyReviewReader, ReviewRow } from "#port/inbound";

export interface DailyReviewDeps {
    universe: DailyUniverseProvider;
    membership: ThemeMembershipProvider;
    stockMaster: StockMasterRepository;
    marketCap: DailyMarketCapRepository;
    dailyIssue: DailyIssueRepository;
}

export class DailyReviewService implements DailyReviewReader {
    constructor(private readonly deps: DailyReviewDeps) {}

    async reviewByDate(date: string): Promise<ReviewRow[]> {
        const { universe, membership, stockMaster, marketCap, dailyIssue } = this.deps;
        const codes = await universe.stockCodesByDate(date);
        if (codes.length === 0) return []; // 그날 분봉 없음 → 다른 조회 생략

        const universeSet = new Set(codes);
        const members = await membership.load();
        // universe 교집합 위에 인덱스 — themesOf 가 그날 분류 대상만 덮으면 충분(codesOf 는 여기선 미사용).
        const index = buildThemeIndex(members.filter((m) => universeSet.has(m.code)));

        const [masters, caps, issues] = await Promise.all([
            stockMaster.getByStockCodes(codes),
            marketCap.getByDateAndCodes(date, codes),
            dailyIssue.getByDate(date),
        ]);

        const nameByCode = new Map(masters.map((m) => [m.stockCode, m.name]));
        const capByCode = new Map(caps.map((c) => [c.stockCode, c.marketCap]));
        const issuesByCode = new Map<string, DailyIssue[]>();
        for (const i of issues) {
            const arr = issuesByCode.get(i.stockCode);
            if (arr) arr.push(i);
            else issuesByCode.set(i.stockCode, [i]);
        }

        return codes.map((code) => ({
            stockCode: code,
            name: nameByCode.get(code) ?? null,
            marketCap: capByCode.get(code) ?? null,
            candidateThemes: index.themesOf(code),
            confirmedIssues: issuesByCode.get(code) ?? [],
        }));
    }
}
