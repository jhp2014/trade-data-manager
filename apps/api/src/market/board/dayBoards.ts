// DayBoards — api 읽기모델(조립부, 캐시 없음). 캐시(DerivedCache 파일 · MasterCache/Membership 메모리)를
// 조합해 화면별 응답을 만든다. daySummary 순수함수(assembleBaseSnapshots·buildDaySummary) + core themeStatsOf 로 조립.
//   themeBoard — EOD %·시총·분봉파생 + master·시트·코멘트(fresh) + 테마 EOD folding
//   replayBoard — 분봉파생 + master·시트(테마명). 코멘트·EOD % 안 씀.
// 응답 wire 계약(EnrichedDaySummary·ReplayBoard)은 contracts/wire 에 두고 서버·클라가 공유한다.
import { themeStatsOf, type ThemeMember, type DailyCommentReader } from "@trade-data-manager/market";
import type { EnrichedSnapshot, EnrichedDaySummary, ReplayStock, ReplayBoard } from "@trade-data-manager/wire";
import { assembleBaseSnapshots, applyComments, buildDaySummary } from "./daySummary.js";
import type { DerivedCache } from "./derivedCache.js";
import type { MasterCache } from "./masterCache.js";

// 컨트롤러가 여기서 계속 import 하도록 wire 계약을 이 모듈 표면으로도 재노출.
export type { EnrichedSnapshot, EnrichedDaySummary, ReplayStock, ReplayBoard };

export interface DayBoardsDeps {
    derived: DerivedCache;
    master: MasterCache;
    membership: { load(): Promise<ThemeMember[]> };
    dailyComment: DailyCommentReader;
}

export class DayBoards {
    constructor(private readonly deps: DayBoardsDeps) {}

    async themeBoard(date: string): Promise<EnrichedDaySummary> {
        const [snap, comments, members] = await Promise.all([
            this.deps.derived.snapshot(date),
            this.deps.dailyComment.getByDate(date),
            this.deps.membership.load(),
        ]);
        const codes = snap.stocks.map((s) => s.code);
        const masters = await this.deps.master.getByStockCodes(codes);
        const byCode = new Map(snap.stocks.map((s) => [s.code, { stats: s.stats, marketCap: s.marketCap }]));
        const summary = buildDaySummary(date, applyComments(assembleBaseSnapshots(date, codes, { members, masters, byCode }), comments));
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
