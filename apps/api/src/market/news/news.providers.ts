import type { Provider } from "@nestjs/common";
import { createDb, DrizzleStockNewsRepository, DrizzleTelegramMessageRepository } from "@trade-data-manager/persistence";
import { ArchiveNewsSearchService, type ChannelMessageReader } from "@trade-data-manager/market";
import { NEWS_CHANNELS } from "@trade-data-manager/telegram";
import { STOCK_NEWS_REPO, NEWS_SEARCHER, ARCHIVE_NEWS_SEARCHER, CHANNEL_MESSAGE_READER, MARKET_POOL } from "../tokens.js";
import type { Pool } from "../pool.js";
import { NewsController } from "./news.controller.js";
import { TelegramNewsController } from "./telegramNews.controller.js";
import { TelegramArchiveController } from "./telegramArchive.controller.js";
import { LazyTelegramNewsSearcher } from "./telegramNewsSearcher.js";

// 뉴스 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
export const newsControllers = [NewsController, TelegramNewsController, TelegramArchiveController];

export const newsProviders: Provider[] = [
    {
        // HTS(시황) 뉴스 읽기 — repo 를 그대로 노출(getHeadlines 당일 + feedHeadlines 커서 페이징).
        provide: STOCK_NEWS_REPO,
        useFactory: (pool: Pool) => new DrizzleStockNewsRepository(createDb(pool)),
        inject: [MARKET_POOL],
    },
    {
        // 텔레그램 뉴스 검색(라이브) — 상주 MTProto(lazy) 검색기. 앱 수명 단일 싱글톤, OnModuleDestroy 에서 close.
        // 아카이브(DB)에 통째로 있는 날은 컨트롤러가 ARCHIVE_NEWS_SEARCHER 로 보내고, 오늘·미수집 날만 이쪽.
        provide: NEWS_SEARCHER,
        useFactory: () => new LazyTelegramNewsSearcher(),
    },
    {
        // 텔레그램 아카이브 읽기(검색 + coverage) — telegram_message/telegram_channel.
        provide: CHANNEL_MESSAGE_READER,
        useFactory: (pool: Pool) => new DrizzleTelegramMessageRepository(createDb(pool)),
        inject: [MARKET_POOL],
    },
    {
        // 아카이브 위의 NewsSearcher — 라이브와 같은 NewsItem(표시명·ref)을 내서 날짜별로 바꿔 끼워도 클라는 모른다.
        provide: ARCHIVE_NEWS_SEARCHER,
        useFactory: (reader: ChannelMessageReader) =>
            new ArchiveNewsSearchService({ reader, labels: new Map(NEWS_CHANNELS.map((c) => [c.peer, c.label])) }),
        inject: [CHANNEL_MESSAGE_READER],
    },
];
