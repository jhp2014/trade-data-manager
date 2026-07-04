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
import { ChartReadService, DaySummaryService, mapWithConcurrency, subtractMonths } from "@trade-data-manager/market";
import type { ChartReader } from "@trade-data-manager/market";
import { CHART_READER, DAY_CHARTS_READER, DAY_REDUCTION_READER, DAY_SUMMARY_READER, PRICE_LINE_REPO, REVIEW_POINT_REPO, STOCK_NEWS_REPO, MARKET_POOL } from "./tokens.js";
import { ChartController } from "./chart.controller.js";
import { DaySummaryController } from "./daySummary.controller.js";
import { PriceLineController } from "./priceLine.controller.js";
import { ReviewPointController } from "./reviewPoint.controller.js";
import { NewsController } from "./news.controller.js";
import { DayChartsController, type DayChartsReader } from "./dayCharts.controller.js";
import { DayReductionController, type DayReductionReader } from "./dayReduction.controller.js";
import { reduceStock, DAY_REDUCTION_VERSION, type ReducedStock, type DayReduction } from "./dayReduction.js";
import { getOrBuildDayReduction } from "./dayReductionCache.js";

// trailingHighs(120거래일) 를 확실히 덮을 원주가 일봉 조회 창(캘린더). 9개월 ≈ ≥180 거래일 여유.
const RAW_DAILY_LOOKBACK_MONTHS = 9;
// 캐시 빌드 시 종목별 fetch 인플라이트 상한(분봉+원주가일봉). 빌드는 날짜당 1회라 넉넉히.
const REDUCTION_FETCH_CONCURRENCY = 8;

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
type Pool = ReturnType<typeof createPoolFromEnv>;

// 조합 루트 — probe 의 composition.ts 로직을 Nest provider 로 옮긴 것(로직만 참고).
// 철칙: core/market 은 프레임워크-프리. @Injectable/@Inject 데코레이터는 이 가장자리(모듈/컨트롤러)에만 둔다.
// 순수 서비스는 useFactory 로 new 해서 Symbol 토큰에 바인딩한다(타입기반 주입 미사용).
@Module({
    controllers: [ChartController, DayChartsController, DayReductionController, DaySummaryController, NewsController, PriceLineController, ReviewPointController],
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
            // 당일 전체 차트 — apps/api 에서만 조합(core 무변경): universe 코드 → 기존 CHART_READER.chartsByCodes 벌크.
            provide: DAY_CHARTS_READER,
            useFactory: (pool: Pool, chart: ChartReader): DayChartsReader => {
                const universe = new DrizzleDailyUniverseProvider(createDb(pool));
                return {
                    async dayCharts(date: string) {
                        const codes = await universe.stockCodesByDate(date);
                        return chart.chartsByCodes(codes, date);
                    },
                };
            },
            inject: [MARKET_POOL, CHART_READER],
        },
        {
            // 당일 축약물 — apps/api 조합(core 무변경): universe 코드 → 종목별 (분봉 ∪ 원주가일봉) fetch → reduceStock.
            // 파일 캐시 read-through 라 miss 때만 raw 순회. 분봉·원주가일봉 repo 를 직접 조합.
            provide: DAY_REDUCTION_READER,
            useFactory: (pool: Pool): DayReductionReader => {
                const db = createDb(pool);
                const universe = new DrizzleDailyUniverseProvider(db);
                const minuteRepo = new DrizzleMinuteCandleRepository(db);
                const rawDailyRepo = new DrizzleRawDailyCandleRepository(db);
                const build = async (date: string): Promise<DayReduction> => {
                    const codes = await universe.stockCodesByDate(date);
                    const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };
                    const reduced = await mapWithConcurrency(codes, REDUCTION_FETCH_CONCURRENCY, async (code) => {
                        const [minutes, rawDaily] = await Promise.all([
                            minuteRepo.getMinuteCandles(code, date),
                            rawDailyRepo.getRawDailyCandles(code, range),
                        ]);
                        return reduceStock(code, minutes, rawDaily, date);
                    });
                    const stocks = reduced.filter((s): s is ReducedStock => s !== null);
                    return { date, version: DAY_REDUCTION_VERSION, stocks };
                };
                return { dayReduction: (date) => getOrBuildDayReduction(date, build) };
            },
            inject: [MARKET_POOL],
        },
        {
            // DaySummary 는 시트 멤버십(Sheets OAuth)까지 타는 조합 — 인증은 env refresh token(읽기전용).
            // 디폴트 시트는 probe 와 동일(선택 UI 생기면 config 교체).
            provide: DAY_SUMMARY_READER,
            useFactory: (pool: Pool): DaySummaryService => {
                const db = createDb(pool);
                return new DaySummaryService({
                    universe: new DrizzleDailyUniverseProvider(db),
                    membership: new SheetThemeMembershipAdapter(createSheetsClient(), DEFAULT_THEME_SHEET),
                    stockMaster: new DrizzleStockMasterRepository(db),
                    marketCap: new DrizzleDailyMarketCapRepository(db),
                    dailyCandle: new DrizzleDailyCandleRepository(db),
                    dailyIssue: new DrizzleDailyIssueRepository(db),
                });
            },
            inject: [MARKET_POOL],
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
    ],
})
export class MarketModule implements OnModuleDestroy {
    constructor(@Inject(MARKET_POOL) private readonly pool: Pool) {}

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
    }
}
