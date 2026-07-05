import { Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleDailyUniverseProvider,
    DrizzleStockMasterRepository,
    DrizzleDailyMarketCapRepository,
    DrizzleDailyIssueRepository,
    DrizzlePriceLineRepository,
    DrizzleReviewPointRepository,
    DrizzleStockNewsRepository,
} from "@trade-data-manager/persistence";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { ChartReadService, applyIssues, buildDaySummary } from "@trade-data-manager/market";
import { CHART_READER, DERIVED_STORE, META_STORE, DAY_REPLAY_READER, DAY_SUMMARY_READER, PRICE_LINE_REPO, REVIEW_POINT_REPO, STOCK_NEWS_REPO, NEWS_SEARCHER, MARKET_POOL } from "./tokens.js";
import { ChartController } from "./chart.controller.js";
import { DaySummaryController, type EnrichedDaySummaryReader } from "./daySummary.controller.js";
import { PriceLineController } from "./priceLine.controller.js";
import { ReviewPointController } from "./reviewPoint.controller.js";
import { NewsController } from "./news.controller.js";
import { TelegramNewsController } from "./telegramNews.controller.js";
import { LazyTelegramNewsSearcher } from "./telegramNewsSearcher.js";
import { DayReplayController, type DayReplayReader } from "./dayReplay.controller.js";
import { DerivedStore } from "./derivedStore.js";
import { MetaStore } from "./metaStore.js";

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
type Pool = ReturnType<typeof createPoolFromEnv>;

// 조합 루트 — probe 의 composition.ts 로직을 Nest provider 로 옮긴 것(로직만 참고).
// 철칙: core/market 은 프레임워크-프리. @Injectable/@Inject 데코레이터는 이 가장자리(모듈/컨트롤러)에만 둔다.
// 순수 서비스는 useFactory 로 new 해서 Symbol 토큰에 바인딩한다(타입기반 주입 미사용).
@Module({
    controllers: [ChartController, DayReplayController, DaySummaryController, NewsController, TelegramNewsController, PriceLineController, ReviewPointController],
    providers: [
        // Pool 은 앱 수명 단일 싱글톤. OnModuleDestroy 에서 graceful end.
        { provide: MARKET_POOL, useFactory: (): Pool => createPoolFromEnv() },
        {
            provide: CHART_READER,
            useFactory: (pool: Pool): ChartReadService => {
                const db = createDb(pool);
                return new ChartReadService({
                    dailyCandle: new DrizzleDailyCandleRepository(db),
                    minuteCandle: new DrizzleMinuteCandleRepository(db),
                    rawDailyCandle: new DrizzleRawDailyCandleRepository(db),
                });
            },
            inject: [MARKET_POOL],
        },
        {
            // 당일 파생값 단일 스토어 — replay(파일)·theme(메모리) 공유 fetch/build. 복기·테마 리더가 이걸 경유.
            provide: DERIVED_STORE,
            useFactory: (pool: Pool): DerivedStore => {
                const db = createDb(pool);
                return new DerivedStore({
                    universe: new DrizzleDailyUniverseProvider(db),
                    minuteRepo: new DrizzleMinuteCandleRepository(db),
                    rawDailyRepo: new DrizzleRawDailyCandleRepository(db),
                });
            },
            inject: [MARKET_POOL],
        },
        {
            // 복기 리더(self-contained) — DerivedStore.replayBoard(파일 per-minute) + MetaStore(meta) 조합.
            // 복기보드가 daySummary 를 따로 안 받아도 되게 이름·시장·시총·테마를 여기서 stitch.
            provide: DAY_REPLAY_READER,
            useFactory: (meta: MetaStore, store: DerivedStore): DayReplayReader => ({
                async dayReplay(date) {
                    const [replay, base] = await Promise.all([store.replayBoard(date), meta.metaByDate(date)]);
                    const metaByCode = new Map(base.map((s) => [s.stockCode, s]));
                    return {
                        date,
                        stocks: replay.stocks.map((md) => {
                            const m = metaByCode.get(md.code);
                            // 테마 전용(minuteOpen·minuteHigh·trailingHighs)은 빼고 복기 필드만 명시 pick.
                            return {
                                code: md.code,
                                times: md.times,
                                rate: md.rate,
                                high: md.high,
                                low: md.low,
                                open: md.open,
                                cumAmount: md.cumAmount,
                                name: m?.name ?? null,
                                market: m?.market ?? null,
                                marketCap: m?.marketCap ?? null,
                                themes: m ? m.themes.map((t) => t.theme) : [],
                            };
                        }),
                    };
                },
            }),
            inject: [META_STORE, DERIVED_STORE],
        },
        {
            // 당일 불변 meta 단일 스토어 — 시트·master·시총·일봉·전일종가 fetch + 거래일 LRU. 테마·복기 리더 공유(시트 1× 조회).
            provide: META_STORE,
            useFactory: (pool: Pool): MetaStore => {
                const db = createDb(pool);
                return new MetaStore({
                    universe: new DrizzleDailyUniverseProvider(db),
                    membership: new SheetThemeMembershipAdapter(createSheetsClient(), DEFAULT_THEME_SHEET),
                    stockMaster: new DrizzleStockMasterRepository(db),
                    marketCap: new DrizzleDailyMarketCapRepository(db),
                    dailyCandle: new DrizzleDailyCandleRepository(db),
                });
            },
            inject: [MARKET_POOL],
        },
        {
            // DaySummary(테마보드) — MetaStore(불변 meta 캐시) + 이슈(fresh) → core 순수조립 + 테마 파생 folding.
            // 조립 로직(assembleBaseSnapshots·applyIssues·buildDaySummary)은 core 순수함수(DaySummaryService 와 공유).
            provide: DAY_SUMMARY_READER,
            useFactory: (pool: Pool, meta: MetaStore, store: DerivedStore): EnrichedDaySummaryReader => {
                const dailyIssue = new DrizzleDailyIssueRepository(createDb(pool));
                return {
                    async summaryByDate(date) {
                        const [base, issues, theme] = await Promise.all([
                            meta.metaByDate(date),
                            dailyIssue.getByDate(date),
                            store.themeBoard(date),
                        ]);
                        const summary = buildDaySummary(date, applyIssues(base, issues));
                        const statsByCode = new Map(theme.stocks.map((s) => [s.code, s]));
                        return {
                            ...summary,
                            stocks: summary.stocks.map((s) => {
                                const st = statsByCode.get(s.stockCode);
                                return st ? { ...s, bucketCounts: st.bucketCounts, trailingHighs: st.trailingHighs } : s;
                            }),
                        };
                    },
                };
            },
            inject: [MARKET_POOL, META_STORE, DERIVED_STORE],
        },
        {
            // 가격선 주석 쓰기(사람 편집) — repo 를 그대로 노출(add/list/remove).
            provide: PRICE_LINE_REPO,
            useFactory: (pool: Pool) => new DrizzlePriceLineRepository(createDb(pool)),
            inject: [MARKET_POOL],
        },
        {
            // 복기 타점 쓰기(사람 편집) — repo 를 그대로 노출(upsert/list/remove).
            provide: REVIEW_POINT_REPO,
            useFactory: (pool: Pool) => new DrizzleReviewPointRepository(createDb(pool)),
            inject: [MARKET_POOL],
        },
        {
            // HTS(시황) 뉴스 읽기 — repo 를 그대로 노출(getHeadlines 당일 + recentHeadlines 커서 페이징).
            provide: STOCK_NEWS_REPO,
            useFactory: (pool: Pool) => new DrizzleStockNewsRepository(createDb(pool)),
            inject: [MARKET_POOL],
        },
        {
            // 텔레그램 뉴스 검색 — 상주 MTProto(lazy) 검색기. 앱 수명 단일 싱글톤, OnModuleDestroy 에서 close.
            provide: NEWS_SEARCHER,
            useFactory: () => new LazyTelegramNewsSearcher(),
        },
    ],
})
export class MarketModule implements OnModuleDestroy {
    constructor(
        @Inject(MARKET_POOL) private readonly pool: Pool,
        @Inject(NEWS_SEARCHER) private readonly newsSearcher: LazyTelegramNewsSearcher,
    ) {}

    async onModuleDestroy(): Promise<void> {
        await this.newsSearcher.close();
        await this.pool.end();
    }
}
