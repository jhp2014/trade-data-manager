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
    DrizzleGroupRepository,
    DrizzleMapRepository,
    DrizzleCandidateDayRepository,
    DrizzleStockNewsRepository,
} from "@trade-data-manager/persistence";
import type { AxisDeps, DataDateReader } from "@trade-data-manager/market";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { CHART_READER, DAY_BOARDS, MASTER_CACHE, MEMBERSHIP_CACHE, THEME_MEMBERSHIP_STORE, THEME_ASSIGNMENT, CHART_ANCHOR_REPO, CHART_ANCHORS, REVIEW_POINT_REPO, DAILY_COMMENTS, RANK_REPO, GROUP_REPO, MAP_REPO, CANDIDATE_DAY_REPO, RANK_MINUTES, COMPUTED_AXES, SKELETON_SHAPES, STOCK_NEWS_REPO, NEWS_SEARCHER, MARKET_POOL, CURATION_POOL, DATA_DATE_READER } from "./tokens.js";
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
import { GroupController } from "./curation/group.controller.js";
import { MapController } from "./curation/map.controller.js";
import { CandidateDayController } from "./curation/candidateDay.controller.js";
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
import { localReadDualWrite } from "./curation/mirrorWrite.js";

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
type Pool = ReturnType<typeof createPoolFromEnv>;

// Pool 은 앱 수명 단일 싱글톤. OnModuleDestroy 에서 graceful end. 도메인 팩토리가 이 위에서 db 를 만든다.
// 두 풀: market(수집·읽기전용) / curation(사람 편집). curation 은 CURATION_DATABASE_URL 로 분리 가능(없으면 market 과 같은 DB로 폴백).
const poolProvider: Provider = { provide: MARKET_POOL, useFactory: (): Pool => createPoolFromEnv() };
const curationPoolProvider: Provider = { provide: CURATION_POOL, useFactory: (): Pool => createCurationPoolFromEnv() };

/**
 * 큐레이션 저장소 한 벌 — **읽기는 로컬 미러, 쓰기는 Supabase + 로컬 재생**(mirrorWrite 주석에 이유).
 * 로컬 미러는 market 과 같은 DB 의 curation 스키마라 MARKET_POOL 로 읽는다(별도 풀이 필요 없다).
 * writes 목록이 곧 "무엇이 쓰기인가"의 단일 출처 — 여기 안 적힌 메서드는 전부 로컬로만 간다.
 */
const curationRepo = <T extends object>(
    make: (db: ReturnType<typeof createDb>) => T,
    writes: readonly (keyof T & string)[],
    label: string,
    localPool: Pool,
    remotePool: Pool,
): T => localReadDualWrite(make(createDb(localPool)), make(createDb(remotePool)), writes, label);

// 계산 축이 읽는 포트 묶음 — 두 소비자(계산 축·골격 좌표)가 **같은 한 벌**을 쓴다.
// 손으로 두 번 적으면 한쪽만 어댑터를 바꿔도 컴파일이 통과해, 같은 골격이 두 소비자에서 다른 가격으로 풀린다.
const axisDepsOf = (marketPool: Pool): AxisDeps => {
    const db = createDb(marketPool);
    const curationDb = db; // 읽기 전용 — curation 은 같은 로컬 DB 의 스키마(미러)
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
        // 시세 파생 + 당일 코멘트 — **읽기라 둘 다 로컬**이다(curation 은 같은 DB 의 미러 스키마).
        // 옛날엔 여기가 "두 DB를 함께 쓰는 유일한 곳"이었는데, 읽기가 미러로 내려오며 그 성질이 사라졌다.
        provide: DAY_BOARDS,
        useFactory: (marketPool: Pool, master: MasterCache, membership: CachedMembership): DayBoards => {
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
            const dailyComment = new DrizzleDailyCommentRepository(db); // 읽기 — 로컬 미러(같은 DB 의 curation 스키마)
            return new DayBoards({ derived, master, membership, dailyComment });
        },
        inject: [MARKET_POOL, MASTER_CACHE, MEMBERSHIP_CACHE],
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
        useFactory: (pool: Pool) => new DrizzleChartAnchorRepository(createDb(pool)), // 읽기 전용 → 로컬 미러
        inject: [MARKET_POOL],
    },
    {
        // 앵커 쓰기 유스케이스 — 불변식(레지스트리·owner grain·골격 집합·multiple 교체·타점 cascade) 소유.
        provide: CHART_ANCHORS,
        useFactory: (marketPool: Pool, curationPool: Pool): ChartAnchors =>
            new ChartAnchors(
                curationRepo((db) => new DrizzleChartAnchorRepository(db), ["add", "remove", "removeByParam", "removeByPoint"], "chartAnchor", marketPool, curationPool),
                curationRepo((db) => new DrizzleReviewPointRepository(db), ["upsert", "remove"], "reviewPoint", marketPool, curationPool),
            ),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 복기 타점 쓰기(사람 편집) — repo 를 그대로 노출(upsert/list/remove).
        provide: REVIEW_POINT_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleReviewPointRepository(db), ["upsert", "remove"], "reviewPoint", marketPool, curationPool),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 당일 코멘트 유스케이스 — 빈값=삭제 규약과 author 소유(env). 보드도 같은 테이블을 읽지만 그건 DayBoards 가 자체 인스턴스로.
        provide: DAILY_COMMENTS,
        useFactory: (marketPool: Pool, curationPool: Pool): DailyComments =>
            new DailyComments(
                curationRepo((db) => new DrizzleDailyCommentRepository(db), ["upsert", "remove"], "dailyComment", marketPool, curationPool),
                process.env.CURATION_AUTHOR ?? "jonghun",
            ),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 순위 배치 — repo 를 그대로 노출(축 CRUD·줄 피드·배치/이동/제거). 조립(줄 렌더)은 클라 인메모리(옵션 A).
        provide: RANK_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleRankRepository(db), ["createAxis", "renameAxis", "removeAxis", "place", "unplace"], "rank", marketPool, curationPool),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 계산 축 — 수식으로 나오는 축의 타점별 수치 + 축당 파일 캐시(증분·앵커 지문 자동 무효화).
        // 배치를 만들지 않으므로 rank repo 와 무관하다. 모집단(타점)·앵커·시세 **전부 읽기라 로컬 한 DB**다.
        provide: COMPUTED_AXES,
        useFactory: (marketPool: Pool): ComputedAxes =>
            new ComputedAxes({
                points: new DrizzleReviewPointRepository(createDb(marketPool)), // 읽기 — 로컬 미러
                axisDeps: axisDepsOf(marketPool),
            }),
        inject: [MARKET_POOL],
    },
    {
        // 골격 좌표 — 계산 축과 **같은 재료·다른 결과**(수치 하나가 아니라 피벗 좌표 그대로). 겹쳐 그리기용.
        // 캐시 없음(SkeletonShapes 주석) — 축이 파일 캐시를 갖는 것과 갈리는 지점이다.
        provide: SKELETON_SHAPES,
        useFactory: (marketPool: Pool): SkeletonShapes => {
            const db = createDb(marketPool);
            return new SkeletonShapes({
                points: new DrizzleReviewPointRepository(createDb(marketPool)), // 읽기 — 로컬 미러
                axisDeps: axisDepsOf(marketPool),
                prevClose: new DrizzleDailyCandleRepository(db), // 절대 뷰 분모 — 종목별 직전 캔들 전용 조회
            });
        },
        inject: [MARKET_POOL],
    },
    {
        // 타점 그룹 — repo 를 그대로 노출(사전 CRUD·전 타점 부착 피드·부착/해제). 축과 달리 순서가 없는 분류.
        provide: GROUP_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleGroupRepository(db), ["createGroup", "renameGroup", "removeGroup", "attach", "detach", "setPlacement", "moveGroups", "setParent"], "group", marketPool, curationPool),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 유사도 맵 — repo 를 그대로 노출(말뭉치 읽기 + 맵/자리 쓰기). 축·그룹이 못 담는 연속적 닮음.
        provide: MAP_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleMapRepository(db), ["createMap", "renameMap", "removeMap"], "map", marketPool, curationPool),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 후보 하루 — 위 큐레이션 편집물들의 (종목,날짜) 합집합. 읽기 전용 파생이라 Store 가 없다.
        provide: CANDIDATE_DAY_REPO,
        useFactory: (pool: Pool) => new DrizzleCandidateDayRepository(createDb(pool)), // 읽기 전용 파생 → 로컬 미러
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
        RankMinutesController,
        DayReplayController,
        DaySummaryController,
        ThemeController,
        ChartAnchorController,
        ReviewPointController,
        CommentController,
        RankController,
        SkeletonController,
        GroupController,
        MapController,
        CandidateDayController,
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
