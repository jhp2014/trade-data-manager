import { Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyCandleRepository,
    DrizzleMinuteCandleRepository,
} from "@trade-data-manager/persistence";
import { ChartReadService } from "@trade-data-manager/market";
import { CHART_READER, MARKET_POOL } from "./tokens.js";
import { ChartController } from "./chart.controller.js";

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
type Pool = ReturnType<typeof createPoolFromEnv>;

// 조합 루트 — probe 의 composition.ts 로직을 Nest provider 로 옮긴 것(로직만 참고).
// 철칙: core/market 은 프레임워크-프리. @Injectable/@Inject 데코레이터는 이 가장자리(모듈/컨트롤러)에만 둔다.
// 순수 서비스는 useFactory 로 new 해서 Symbol 토큰에 바인딩한다(타입기반 주입 미사용).
@Module({
    controllers: [ChartController],
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
                });
            },
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
