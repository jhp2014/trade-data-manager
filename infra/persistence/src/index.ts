// @trade-data-manager/db — 새 헥사고날 시장데이터 영속화(infra). core/market 리포지토리 포트를 Drizzle 로 구현.
// DB = 전용 `market` 스키마(레거시 data-core public 과 격리). 도메인 split ↔ DB flat 매퍼 포함.
export { createDb, createPoolFromEnv, type Database, type Transaction, type DbClient } from "./db.js";
export { ensureDbEnvLoaded, getDatabaseUrl } from "./env.js";
export * as schema from "./schema/index.js";
export { DrizzleDailyCandleRepository } from "./repositories/dailyCandle.repository.js";
export { DrizzleMinuteCandleRepository } from "./repositories/minuteCandle.repository.js";
export { DrizzleStockMasterRepository } from "./repositories/stockMaster.repository.js";
export { DrizzleDailyMarketCapRepository } from "./repositories/dailyMarketCap.repository.js";
export { DrizzleStockNewsRepository } from "./repositories/stockNews.repository.js";
export { DrizzleDailyIssueRepository } from "./repositories/dailyIssue.repository.js";
export { DrizzleDailyUniverseProvider } from "./repositories/dailyUniverse.provider.js";
export {
    dailyCandleToRow,
    rowToDailyCandle,
} from "./mappers/daily.js";
export {
    minuteCandleToRow,
    rowToMinuteCandle,
} from "./mappers/minute.js";
export {
    stockMasterToRow,
    rowToStockMaster,
} from "./mappers/stockMaster.js";
export {
    marketCapToRow,
    rowToMarketCap,
} from "./mappers/marketCap.js";
export {
    newsHeadlineToRows,
    rowToNewsHeadline,
} from "./mappers/news.js";
export {
    dailyIssueToRow,
    rowToDailyIssue,
} from "./mappers/dailyIssue.js";
