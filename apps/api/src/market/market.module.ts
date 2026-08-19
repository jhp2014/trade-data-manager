import { Module, type OnApplicationBootstrap, type OnModuleDestroy, type Provider, Inject } from "@nestjs/common";
import { createPoolFromEnv, createCurationPoolFromEnv } from "@trade-data-manager/persistence";
import { MARKET_POOL, CURATION_POOL, NEWS_SEARCHER, CURATION_SYNC } from "./tokens.js";
import type { Pool } from "./pool.js";
import { chartControllers, chartProviders } from "./chart/chart.providers.js";
import { boardControllers, boardProviders } from "./board/board.providers.js";
import { curationControllers, curationProviders } from "./curation/curation.providers.js";
import { newsControllers, newsProviders } from "./news/news.providers.js";
import { LazyTelegramNewsSearcher } from "./news/telegramNewsSearcher.js";
import { CurationSync } from "./curation/curationSync.js";

// Pool 은 앱 수명 단일 싱글톤. OnModuleDestroy 에서 graceful end. 도메인 팩토리가 이 위에서 db 를 만든다.
// 두 풀: market(수집·읽기전용) / curation(사람 편집). curation 은 CURATION_DATABASE_URL 로 분리 가능(없으면 market 과 같은 DB로 폴백).
const poolProvider: Provider = { provide: MARKET_POOL, useFactory: (): Pool => createPoolFromEnv() };
const curationPoolProvider: Provider = { provide: CURATION_POOL, useFactory: (): Pool => createCurationPoolFromEnv() };

// 조합 루트 — core/market 은 프레임워크-프리. @Injectable/@Inject 데코레이터는 이 가장자리(모듈/컨트롤러)에만.
// 화면별 팩토리 묶음은 폴더별 *.providers.ts 로 — 변경/테스트 단위가 도메인별로 작아진다.
// 읽기모델: 캐시(DerivedCache 파일 · MasterCache/Membership 메모리) → DayBoards 조립. Symbol 토큰 배선.
@Module({
    controllers: [...chartControllers, ...boardControllers, ...curationControllers, ...newsControllers],
    providers: [poolProvider, curationPoolProvider, ...chartProviders, ...boardProviders, ...curationProviders, ...newsProviders],
})
export class MarketModule implements OnApplicationBootstrap, OnModuleDestroy {
    constructor(
        @Inject(MARKET_POOL) private readonly pool: Pool,
        @Inject(CURATION_POOL) private readonly curationPool: Pool,
        @Inject(NEWS_SEARCHER) private readonly newsSearcher: LazyTelegramNewsSearcher,
        @Inject(CURATION_SYNC) private readonly curationSync: CurationSync,
    ) {}

    /**
     * 부팅 시 미러가 **하루 넘게 낡았으면** 당겨온다(`runIfStale`). 매번 당기지 않는 이유는 그쪽 주석에.
     * **기다리지 않는다(fire-and-forget)**: Supabase 왕복이 부팅을 막으면 원격이 느리거나 죽었을 때
     * 앱이 아예 안 뜬다. 미러는 최악이라도 어제치라 그동안 읽기는 정상 동작한다.
     */
    onApplicationBootstrap(): void {
        void this.curationSync
            .runIfStale()
            .then((r) => {
                if (!r) {
                    console.log("[mirror] 미러가 최신(24시간 이내) — 부팅 동기화 건너뜀");
                    return;
                }
                console.log(r.skipped ? "[mirror] 원격 없음 — 미러 건너뜀" : `[mirror] 부팅 동기화 완료(${r.rows}행)`);
            })
            .catch((e: unknown) => console.error("[mirror] 부팅 동기화 실패 — 미러는 직전 상태로 계속 쓴다", e));
    }

    async onModuleDestroy(): Promise<void> {
        await this.newsSearcher.close();
        await this.pool.end();
        await this.curationPool.end();
    }
}
