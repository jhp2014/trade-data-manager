// DayBoards — api 읽기모델(조립부, 캐시 없음). 캐시(DerivedCache 파일 · MasterCache/Membership 메모리)를
// 조합해 화면별 응답을 만든다. core 순수함수(assembleBaseSnapshots·buildDaySummary·themeStatsOf)로 조립.
//   themeBoard — EOD %·시총·분봉파생 + master·시트·이슈(fresh) + 테마 EOD folding
//   replayBoard — 분봉파생 + master·시트(테마명). 이슈·EOD % 안 씀.
import {
    assembleBaseSnapshots,
    applyIssues,
    buildDaySummary,
    themeStatsOf,
    type DailySnapshot,
    type DaySummary,
    type MinuteDerived,
    type ThemeMember,
    type DailyIssueRepository,
} from "@trade-data-manager/market";
import type { DerivedCache } from "./derivedCache.js";
import type { MasterCache } from "./masterCache.js";

/** 테마보드 스냅샷 — 이슈 축약(EOD) folding. 분봉 없는 종목은 두 필드 생략(옵셔널). */
export type EnrichedSnapshot = DailySnapshot & { bucketCounts?: number[]; trailingHighs?: number[] };
export type EnrichedDaySummary = Omit<DaySummary, "stocks"> & { stocks: EnrichedSnapshot[] };

/** 복기보드 종목 — 복기 전용 per-minute + 메타(self-contained). */
export interface ReplayStock extends Pick<MinuteDerived, "code" | "times" | "rate" | "high" | "low" | "open" | "cumAmount"> {
    name: string | null;
    market: string | null;
    marketCap: string | null; // 원, 무손실 string
    themes: string[]; // 테마명
}
export interface ReplayBoard {
    date: string;
    stocks: ReplayStock[];
}

export interface DayBoardsDeps {
    derived: DerivedCache;
    master: MasterCache;
    membership: { load(): Promise<ThemeMember[]> };
    dailyIssue: DailyIssueRepository;
}

export class DayBoards {
    constructor(private readonly deps: DayBoardsDeps) {}

    async themeBoard(date: string): Promise<EnrichedDaySummary> {
        const [snap, issues, members] = await Promise.all([
            this.deps.derived.snapshot(date),
            this.deps.dailyIssue.getByDate(date),
            this.deps.membership.load(),
        ]);
        const codes = snap.stocks.map((s) => s.code);
        const masters = await this.deps.master.getByStockCodes(codes);
        const byCode = new Map(snap.stocks.map((s) => [s.code, { stats: s.stats, marketCap: s.marketCap }]));
        const summary = buildDaySummary(date, applyIssues(assembleBaseSnapshots(date, codes, { members, masters, byCode }), issues));
        const statsByCode = new Map(snap.stocks.map((s) => [s.code, themeStatsOf(s.minutes)]));
        return {
            ...summary,
            stocks: summary.stocks.map((s) => {
                const st = statsByCode.get(s.stockCode);
                return st ? { ...s, bucketCounts: st.bucketCounts, trailingHighs: st.trailingHighs } : s;
            }),
        };
    }

    async replayBoard(date: string): Promise<ReplayBoard> {
        const [snap, members] = await Promise.all([this.deps.derived.snapshot(date), this.deps.membership.load()]);
        const codes = snap.stocks.map((s) => s.code);
        const masters = await this.deps.master.getByStockCodes(codes);
        const byCode = new Map(snap.stocks.map((s) => [s.code, { stats: s.stats, marketCap: s.marketCap }]));
        const base = assembleBaseSnapshots(date, codes, { members, masters, byCode });
        const baseByCode = new Map(base.map((b) => [b.stockCode, b]));
        return {
            date,
            stocks: snap.stocks.map((s) => {
                const md = s.minutes;
                const b = baseByCode.get(s.code);
                return {
                    code: s.code,
                    times: md.times,
                    rate: md.rate,
                    high: md.high,
                    low: md.low,
                    open: md.open,
                    cumAmount: md.cumAmount,
                    name: b?.name ?? null,
                    market: b?.market ?? null,
                    marketCap: s.marketCap,
                    themes: b ? b.themes.map((t) => t.theme) : [],
                };
            }),
        };
    }
}
