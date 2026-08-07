import { Module, type OnModuleDestroy, type Provider, Inject } from "@nestjs/common";
import {
    createDb,
    createPoolFromEnv,
    createCurationPoolFromEnv,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleDailyUniverseProvider,
    DrizzleStockMasterRepository,
    DrizzleDailyMarketCapRepository,
    DrizzleDailyCommentRepository,
    DrizzleChartAnchorRepository,
    DrizzleReviewPointRepository,
    DrizzleRankRepository,
    DrizzleTagRepository,
    DrizzleStockNewsRepository,
} from "@trade-data-manager/persistence";
import type { AxisDeps, DataDateReader } from "@trade-data-manager/market";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { CHART_READER, DAY_BOARDS, MASTER_CACHE, MEMBERSHIP_CACHE, THEME_MEMBERSHIP_STORE, THEME_ASSIGNMENT, CHART_ANCHOR_REPO, CHART_ANCHORS, REVIEW_POINT_REPO, DAILY_COMMENTS, RANK_REPO, TAG_REPO, RANK_MINUTES, COMPUTED_AXES, SKELETON_SHAPES, STOCK_NEWS_REPO, NEWS_SEARCHER, MARKET_POOL, CURATION_POOL, DATA_DATE_READER } from "./tokens.js";
import { ChartController } from "./chart/chart.controller.js";
import { ChartReadModel } from "./chart/chartReadModel.js";
import { RankMinutes } from "./rank/rankMinutes.js";
import { ComputedAxes } from "./rank/computedAxes.js";
import { SkeletonShapes } from "./rank/skeletonShapes.js";
import { RankMinutesController } from "./rank/rankMinutes.controller.js";
import { SkeletonController } from "./rank/skeleton.controller.js";
import { DaySummaryController } from "./board/daySummary.controller.js";
import { DayReplayController } from "./board/dayReplay.controller.js";
import { DatesController } from "./board/dates.controller.js";
import { ThemeController } from "./board/theme.controller.js";
import { ChartAnchorController } from "./curation/chartAnchor.controller.js";
import { ReviewPointController } from "./curation/reviewPoint.controller.js";
import { CommentController } from "./curation/comment.controller.js";
import { RankController } from "./curation/rank.controller.js";
import { TagController } from "./curation/tag.controller.js";
import { NewsController } from "./news/news.controller.js";
import { TelegramNewsController } from "./news/telegramNews.controller.js";
import { StocksController } from "./stocks/stocks.controller.js";
import { LazyTelegramNewsSearcher } from "./news/telegramNewsSearcher.js";
import { DerivedCache } from "./board/derivedCache.js";
import { MasterCache } from "./board/masterCache.js";
import { DayBoards } from "./board/dayBoards.js";
import { CachedMembership } from "./board/cachedMembership.js";
import { DataDatesCache } from "./board/dataDatesCache.js";
import { ThemeAssignment } from "./board/themeAssignment.js";
import { DailyComments } from "./curation/dailyComments.js";
import { ChartAnchors } from "./curation/chartAnchors.js";

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
type Pool = ReturnType<typeof createPoolFromEnv>;

// Pool 은 앱 수명 단일 싱글톤. OnModuleDestroy 에서 graceful end. 도메인 팩토리가 이 위에서 db 를 만든다.
// 두 풀: market(수집·읽기전용) / curation(사람 편집). curation 은 CURATION_DATABASE_URL 로 분리 가능(없으면 market 과 같은 DB로 폴백).
const poolProvider: Provider = { provide: MARKET_POOL, useFactory: (): Pool => createPoolFromEnv() };
const curationPoolProvider: Provider = { provide: CURATION_POOL, useFactory: (): Pool => createCurationPoolFromEnv() };

// 계산 축이 읽는 포트 묶음 — 두 소비자(계산 축·골격 좌표)가 **같은 한 벌**을 쓴다.
// 손으로 두 번 적으면 한쪽만 어댑터를 바꿔도 컴파일이 통과해, 같은 골격이 두 소비자에서 다른 가격으로 풀린다.
const axisDepsOf = (marketPool: Pool, curationPool: Pool): AxisDeps => {
    const db = createDb(marketPool);
    const curationDb = createDb(curationPool);
    return {
        minute: new DrizzleMinuteCandleRepository(db),
        rawDaily: new DrizzleRawDailyCandleRepository(db),
        adjDaily: new DrizzleDailyCandleRepository(db), // 수정주가 창(AdjustedDailyReader)
        chartAnchor: new DrizzleChartAnchorRepository(curationDb),
        reviewPoints: new DrizzleReviewPointRepository(curationDb), // 분봉 골격의 타점 종가 합성(형제 결합)
    };
};

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
    {
        // 순위 필터 분석 — (종목,날) raw UN 분봉 공급. 정규화·집계는 클라(core/market). 무캐시(클라 react-query 날별 캐시).
        provide: RANK_MINUTES,
        useFactory: (pool: Pool): RankMinutes => new RankMinutes({ minuteCandle: new DrizzleMinuteCandleRepository(createDb(pool)) }),
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
        // 시트 테마 어댑터 — 읽기(Provider)+쓰기(Store) 겸용 단일 인스턴스. Store 는 우클릭 배정(POST /theme/members)이 씀.
        provide: THEME_MEMBERSHIP_STORE,
        useFactory: (): SheetThemeMembershipAdapter => new SheetThemeMembershipAdapter(createSheetsClient(), DEFAULT_THEME_SHEET),
    },
    {
        // 테마 인덱스(시트) 메모리 캐시(날짜무관, 1회 로드). 시트 편집·배정 시 refresh() 로 무효화(같은 어댑터를 감싼다).
        provide: MEMBERSHIP_CACHE,
        useFactory: (store: SheetThemeMembershipAdapter): CachedMembership => new CachedMembership(store),
        inject: [THEME_MEMBERSHIP_STORE],
    },
    {
        // 보드 읽기모델 — 날짜별 불변 파일 캐시(DerivedCache) + 메모리 캐시 조합. query 포트 직접 호출.
        // 두 DB를 함께 쓰는 유일한 곳: 시세 파생(market) + 당일 코멘트(curation). SQL 조인이 아니라 각 DB에서 읽어 앱에서 합친다.
        provide: DAY_BOARDS,
        useFactory: (marketPool: Pool, curationPool: Pool, master: MasterCache, membership: CachedMembership): DayBoards => {
            const db = createDb(marketPool);
            const dailyRepo = new DrizzleDailyCandleRepository(db); // 스냅샷 배치 + 수정주가 창(AdjustedDailyReader) 겸용
            const derived = new DerivedCache({
                universe: new DrizzleDailyUniverseProvider(db),
                minute: new DrizzleMinuteCandleRepository(db),
                rawDaily: new DrizzleRawDailyCandleRepository(db),
                adjDaily: dailyRepo,
                dailyCandle: dailyRepo,
                marketCap: new DrizzleDailyMarketCapRepository(db),
            });
            const dailyComment = new DrizzleDailyCommentRepository(createDb(curationPool));
            return new DayBoards({ derived, master, membership, dailyComment });
        },
        inject: [MARKET_POOL, CURATION_POOL, MASTER_CACHE, MEMBERSHIP_CACHE],
    },
    {
        // 테마 배정 유스케이스 — 시트 쓰기 + 중복 skip + 캐시 무효화 순서를 소유(컨트롤러는 검증만).
        provide: THEME_ASSIGNMENT,
        useFactory: (membership: CachedMembership, master: MasterCache, store: SheetThemeMembershipAdapter): ThemeAssignment =>
            new ThemeAssignment(membership, master, store),
        inject: [MEMBERSHIP_CACHE, MASTER_CACHE, THEME_MEMBERSHIP_STORE],
    },
    {
        // 데이터(분봉) 있는 거래일 목록(전역·종목무관) — data-aware 날짜피커.
        // 파일 캐시: cold 전체 distinct 1회 → warm 파일 read-through, 하루 1회 꼬리 증분(파티션 프루닝).
        // 소스가 일봉(~2년 딥 백필)이면 장중데이터 없는 과거일까지 노출되므로 분봉 실보유일로 소스 교체.
        provide: DATA_DATE_READER,
        useFactory: (pool: Pool): DataDateReader => new DataDatesCache(new DrizzleMinuteCandleRepository(createDb(pool))),
        inject: [MARKET_POOL],
    },
];

const curationProviders: Provider[] = [
    {
        // 차트 앵커 저장소 — 읽기(컨트롤러 조회·계산 축)용. 쓰기는 유스케이스(CHART_ANCHORS)를 거친다.
        provide: CHART_ANCHOR_REPO,
        useFactory: (pool: Pool) => new DrizzleChartAnchorRepository(createDb(pool)),
        inject: [CURATION_POOL],
    },
    {
        // 앵커 쓰기 유스케이스 — 불변식(레지스트리·owner grain·골격 집합·multiple 교체·타점 cascade) 소유.
        provide: CHART_ANCHORS,
        useFactory: (pool: Pool): ChartAnchors => {
            const db = createDb(pool);
            return new ChartAnchors(new DrizzleChartAnchorRepository(db), new DrizzleReviewPointRepository(db));
        },
        inject: [CURATION_POOL],
    },
    {
        // 복기 타점 쓰기(사람 편집) — repo 를 그대로 노출(upsert/list/remove).
        provide: REVIEW_POINT_REPO,
        useFactory: (pool: Pool) => new DrizzleReviewPointRepository(createDb(pool)),
        inject: [CURATION_POOL],
    },
    {
        // 당일 코멘트 유스케이스 — 빈값=삭제 규약과 author 소유(env). 보드도 같은 테이블을 읽지만 그건 DayBoards 가 자체 인스턴스로.
        provide: DAILY_COMMENTS,
        useFactory: (pool: Pool): DailyComments =>
            new DailyComments(new DrizzleDailyCommentRepository(createDb(pool)), process.env.CURATION_AUTHOR ?? "jonghun"),
        inject: [CURATION_POOL],
    },
    {
        // 순위 배치 — repo 를 그대로 노출(축 CRUD·줄 피드·배치/이동/제거). 조립(줄 렌더)은 클라 인메모리(옵션 A).
        provide: RANK_REPO,
        useFactory: (pool: Pool) => new DrizzleRankRepository(createDb(pool)),
        inject: [CURATION_POOL],
    },
    {
        // 계산 축 — 수식으로 나오는 축의 타점별 수치 + 축당 파일 캐시(증분·앵커 지문 자동 무효화).
        // 배치를 만들지 않으므로 rank repo 와 무관하다. 두 DB를 함께 쓴다: 모집단(타점)·앵커는 curation, 시세는 market.
        provide: COMPUTED_AXES,
        useFactory: (marketPool: Pool, curationPool: Pool): ComputedAxes =>
            new ComputedAxes({
                points: new DrizzleReviewPointRepository(createDb(curationPool)),
                axisDeps: axisDepsOf(marketPool, curationPool),
            }),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 골격 좌표 — 계산 축과 **같은 재료·다른 결과**(수치 하나가 아니라 피벗 좌표 그대로). 겹쳐 그리기용.
        // 캐시 없음(SkeletonShapes 주석) — 축이 파일 캐시를 갖는 것과 갈리는 지점이다.
        provide: SKELETON_SHAPES,
        useFactory: (marketPool: Pool, curationPool: Pool): SkeletonShapes =>
            new SkeletonShapes({
                points: new DrizzleReviewPointRepository(createDb(curationPool)),
                axisDeps: axisDepsOf(marketPool, curationPool),
            }),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 타점 태그 — repo 를 그대로 노출(사전 CRUD·전 타점 부착 피드·부착/해제). 축과 달리 순서가 없는 분류.
        provide: TAG_REPO,
        useFactory: (pool: Pool) => new DrizzleTagRepository(createDb(pool)),
        inject: [CURATION_POOL],
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
        RankMinutesController,
        DayReplayController,
        DaySummaryController,
        ThemeController,
        ChartAnchorController,
        ReviewPointController,
        CommentController,
        RankController,
        SkeletonController,
        TagController,
        NewsController,
        TelegramNewsController,
        StocksController,
        DatesController,
    ],
    providers: [poolProvider, curationPoolProvider, ...chartProviders, ...boardProviders, ...curationProviders, ...newsProviders],
})
export class MarketModule implements OnModuleDestroy {
    constructor(
        @Inject(MARKET_POOL) private readonly pool: Pool,
        @Inject(CURATION_POOL) private readonly curationPool: Pool,
        @Inject(NEWS_SEARCHER) private readonly newsSearcher: LazyTelegramNewsSearcher,
    ) {}

    async onModuleDestroy(): Promise<void> {
        await this.newsSearcher.close();
        await this.pool.end();
        await this.curationPool.end();
    }
}
