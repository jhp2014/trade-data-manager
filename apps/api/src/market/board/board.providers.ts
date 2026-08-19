import type { Provider } from "@nestjs/common";
import {
    createDb,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleDailyUniverseProvider,
    DrizzleStockMasterRepository,
    DrizzleDailyMarketCapRepository,
    DrizzleDailyCommentRepository,
} from "@trade-data-manager/persistence";
import type { DataDateReader } from "@trade-data-manager/market";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { DAY_BOARDS, MASTER_CACHE, MEMBERSHIP_CACHE, THEME_MEMBERSHIP_STORE, THEME_ASSIGNMENT, MARKET_POOL, DATA_DATE_READER } from "../tokens.js";
import type { Pool } from "../pool.js";
import { DerivedCache } from "./derivedCache.js";
import { MasterCache } from "./masterCache.js";
import { DayBoards } from "./dayBoards.js";
import { CachedMembership } from "./cachedMembership.js";
import { DataDatesCache } from "./dataDatesCache.js";
import { ThemeAssignment } from "./themeAssignment.js";
import { DaySummaryController } from "./daySummary.controller.js";
import { DayReplayController } from "./dayReplay.controller.js";
import { DatesController } from "./dates.controller.js";
import { ThemeController } from "./theme.controller.js";
import { StocksController } from "../stocks/stocks.controller.js";

// 보드(날짜 단위) 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
// StocksController 는 종목 마스터(MASTER_CACHE) 소비자라 여기 묶인다.
export const boardControllers = [DayReplayController, DaySummaryController, ThemeController, StocksController, DatesController];

export const boardProviders: Provider[] = [
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
                scan: dailyRepo, // 수집 완료 판정(기대집합 재계산) — DailyScanRepository 겸용
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
