import { Module, type OnModuleDestroy, type Provider, Inject } from "@nestjs/common";
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
    DrizzleHypothesisRepository,
    DrizzleStockNewsRepository,
} from "@trade-data-manager/persistence";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { CHART_READER, DAY_BOARDS, MASTER_CACHE, MEMBERSHIP_CACHE, PRICE_LINE_REPO, REVIEW_POINT_REPO, HYPOTHESIS_REPO, STOCK_NEWS_REPO, NEWS_SEARCHER, MARKET_POOL } from "./tokens.js";
import { ChartController } from "./chart/chart.controller.js";
import { ChartReadModel } from "./chart/chartReadModel.js";
import { DaySummaryController } from "./board/daySummary.controller.js";
import { DayReplayController } from "./board/dayReplay.controller.js";
import { ThemeController } from "./board/theme.controller.js";
import { PriceLineController } from "./curation/priceLine.controller.js";
import { ReviewPointController } from "./curation/reviewPoint.controller.js";
import { HypothesisController } from "./curation/hypothesis.controller.js";
import { NewsController } from "./news/news.controller.js";
import { TelegramNewsController } from "./news/telegramNews.controller.js";
import { StocksController } from "./stocks/stocks.controller.js";
import { LazyTelegramNewsSearcher } from "./news/telegramNewsSearcher.js";
import { DerivedCache } from "./board/derivedCache.js";
import { MasterCache } from "./board/masterCache.js";
import { DayBoards } from "./board/dayBoards.js";
import { CachedMembership } from "./board/cachedMembership.js";

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
type Pool = ReturnType<typeof createPoolFromEnv>;

// Pool 은 앱 수명 단일 싱글톤. OnModuleDestroy 에서 graceful end. 모든 도메인 팩토리가 이 위에서 db 를 만든다.
const poolProvider: Provider = { provide: MARKET_POOL, useFactory: (): Pool => createPoolFromEnv() };

// ── 화면별 팩토리 묶음 — 폴더(chart/board/curation/news)와 1:1. 변경/테스트 단위가 도메인별로 작아진다.
const chartProviders: Provider[] = [
    {
        // 차트(종목1개) — raw 번들 조립, 무캐시(종목당이라 싸다).
        provide: CHART_READER,
        useFactory: (pool: Pool): ChartReadModel => {
            const db = createDb(pool);
            return new ChartReadModel({
                dailyCandle: new DrizzleDailyCandleRepository(db),
                minuteCandle: new DrizzleMinuteCandleRepository(db),
                rawDailyCandle: new DrizzleRawDailyCandleRepository(db),
            });
        },
        inject: [MARKET_POOL],
    },
];

const boardProviders: Provider[] = [
    {
        // 종목 마스터 메모리 캐시(날짜무관). 신규상장 시 /theme/refresh 로 무효화.
        provide: MASTER_CACHE,
        useFactory: (pool: Pool): MasterCache => new MasterCache(new DrizzleStockMasterRepository(createDb(pool))),
        inject: [MARKET_POOL],
    },
    {
        // 테마 인덱스(시트) 메모리 캐시(날짜무관, 1회 로드). 시트 편집 시 /theme/refresh 로 무효화.
        provide: MEMBERSHIP_CACHE,
        useFactory: (): CachedMembership => new CachedMembership(new SheetThemeMembershipAdapter(createSheetsClient(), DEFAULT_THEME_SHEET)),
    },
    {
        // 보드 읽기모델 — 날짜별 불변 파일 캐시(DerivedCache) + 메모리 캐시 조합. query 포트 직접 호출.
        provide: DAY_BOARDS,
        useFactory: (pool: Pool, master: MasterCache, membership: CachedMembership): DayBoards => {
            const db = createDb(pool);
            const derived = new DerivedCache({
                universe: new DrizzleDailyUniverseProvider(db),
                minute: new DrizzleMinuteCandleRepository(db),
                rawDaily: new DrizzleRawDailyCandleRepository(db),
                dailyCandle: new DrizzleDailyCandleRepository(db),
                marketCap: new DrizzleDailyMarketCapRepository(db),
            });
            return new DayBoards({ derived, master, membership, dailyIssue: new DrizzleDailyIssueRepository(db) });
        },
        inject: [MARKET_POOL, MASTER_CACHE, MEMBERSHIP_CACHE],
    },
];

const curationProviders: Provider[] = [
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
        // 가설 큐레이션 — repo 를 그대로 노출(목록·생성·연결/해제). 조립·필터는 클라 인메모리(옵션 A).
        provide: HYPOTHESIS_REPO,
        useFactory: (pool: Pool) => new DrizzleHypothesisRepository(createDb(pool)),
        inject: [MARKET_POOL],
    },
];

const newsProviders: Provider[] = [
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
];

// 조합 루트 — core/market 은 프레임워크-프리. @Injectable/@Inject 데코레이터는 이 가장자리(모듈/컨트롤러)에만.
// 읽기모델: 캐시(DerivedCache 파일 · MasterCache/Membership 메모리) → DayBoards 조립. Symbol 토큰 배선.
@Module({
    controllers: [
        ChartController,
        DayReplayController,
        DaySummaryController,
        ThemeController,
        PriceLineController,
        ReviewPointController,
        HypothesisController,
        NewsController,
        TelegramNewsController,
        StocksController,
    ],
    providers: [poolProvider, ...chartProviders, ...boardProviders, ...curationProviders, ...newsProviders],
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
