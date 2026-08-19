import type { Provider } from "@nestjs/common";
import {
    createDb,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
} from "@trade-data-manager/persistence";
import { CHART_READER, RANK_MINUTES, MARKET_POOL } from "../tokens.js";
import type { Pool } from "../pool.js";
import { ChartController } from "./chart.controller.js";
import { ChartReadModel } from "./chartReadModel.js";
import { RankMinutes } from "../rank/rankMinutes.js";
import { RankMinutesController } from "../rank/rankMinutes.controller.js";

// 차트(종목 단건) 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
export const chartControllers = [ChartController, RankMinutesController];

export const chartProviders: Provider[] = [
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
