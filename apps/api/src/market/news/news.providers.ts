import type { Provider } from "@nestjs/common";
import { createDb, DrizzleStockNewsRepository } from "@trade-data-manager/persistence";
import { STOCK_NEWS_REPO, NEWS_SEARCHER, MARKET_POOL } from "../tokens.js";
import type { Pool } from "../pool.js";
import { NewsController } from "./news.controller.js";
import { TelegramNewsController } from "./telegramNews.controller.js";
import { LazyTelegramNewsSearcher } from "./telegramNewsSearcher.js";

// 뉴스 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
export const newsControllers = [NewsController, TelegramNewsController];

export const newsProviders: Provider[] = [
    {
        // HTS(시황) 뉴스 읽기 — repo 를 그대로 노출(getHeadlines 당일 + feedHeadlines 커서 페이징).
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
