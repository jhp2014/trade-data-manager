import type { Provider } from "@nestjs/common";
import {
    createDb,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
} from "@trade-data-manager/persistence";
import { CHART_READER, MARKET_POOL } from "../tokens.js";
import type { Pool } from "../pool.js";
import { ChartController } from "./chart.controller.js";
import { ChartReadModel } from "./chartReadModel.js";

// 차트(종목 단건) 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
export const chartControllers = [ChartController];

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
];
