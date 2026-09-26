import {
    createDb,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleChartAnchorRepository,
    DrizzleDailyMarketCapRepository,
} from "@trade-data-manager/persistence";
import type { AxisDeps } from "@trade-data-manager/market";
import type { Pool } from "../pool.js";

// 격자·recon 이 읽는 포트 묶음 — 소비자들이 **같은 한 벌**을 쓴다.
// 손으로 두 번 적으면 한쪽만 어댑터를 바꿔도 컴파일이 통과해, 같은 골격이 두 소비자에서 다른 가격으로 풀린다.
export const axisDepsOf = (marketPool: Pool): AxisDeps => {
    const db = createDb(marketPool);
    const curationDb = db; // 읽기 전용 — curation 은 같은 로컬 DB 의 스키마(미러)
    return {
        minute: new DrizzleMinuteCandleRepository(db),
        rawDaily: new DrizzleRawDailyCandleRepository(db),
        adjDaily: new DrizzleDailyCandleRepository(db), // 수정주가 창(AdjustedDailyReader)
        chartAnchor: new DrizzleChartAnchorRepository(curationDb),
        marketCap: new DrizzleDailyMarketCapRepository(db),
    };
};
