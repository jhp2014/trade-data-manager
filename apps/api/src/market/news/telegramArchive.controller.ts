import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import type { ArchiveNewsSearchService, ChannelMessageReader, NewsItem } from "@trade-data-manager/market";
import { kstDayBounds } from "@trade-data-manager/market";
import { NEWS_CHANNELS } from "@trade-data-manager/telegram";
import type { TelegramArchivePage, TelegramNewsItem } from "@trade-data-manager/wire";
import { ARCHIVE_NEWS_SEARCHER, CHANNEL_MESSAGE_READER } from "../tokens.js";
import { assertYmd } from "../validation.js";

const DEFAULT_LIMIT = 2000; // 하루 9방 ~480건 — 보통 한 번에 끝난다.
const MAX_LIMIT = 5000;
const PEERS = NEWS_CHANNELS.map((c) => c.peer);

function toWire(n: NewsItem): TelegramNewsItem {
    return { channel: n.channel, at: n.at.toISOString(), text: n.text, url: n.url, ref: n.ref, ...(n.links ? { links: n.links } : {}) };
}

// GET /news/telegram/archive?date= | from=&to= [&q=] [&limit=] [&before=] — **DB 아카이브만** 읽는다(라이브 폴백 없음).
// AI 덤프(q 없이 그날 전체)와 trade-lab 텔레그램 패널(q 검색) 공용. 과거 날짜 걷기는 클라이언트가 date 를 당겨 가며
// 하고 coverage.from 에 닿으면 멈춘다 — DB 호출이 싸서 서버가 걸어 줄 이유가 없다(라이브 /news/telegram 과 다른 점).
// coverage 는 "그날 언급 없음"과 "그날이 아직 DB 에 없음"을 가르는 재료 — 비어 있는 결과도 이걸로 뜻이 정해진다.
@Controller("news/telegram/archive")
export class TelegramArchiveController {
    constructor(
        @Inject(ARCHIVE_NEWS_SEARCHER) private readonly archive: ArchiveNewsSearchService,
        @Inject(CHANNEL_MESSAGE_READER) private readonly reader: ChannelMessageReader,
    ) {}

    @Get()
    async search(
        @Query("date") date?: string,
        @Query("from") from?: string,
        @Query("to") to?: string,
        @Query("q") q?: string,
        @Query("limit") limitRaw?: string,
        @Query("before") before?: string,
    ): Promise<TelegramArchivePage> {
        const range = resolveRange(date, from, to);
        const limit = resolveLimit(limitRaw);
        const { since } = kstDayBounds(range.from);
        const { until } = kstDayBounds(range.to);

        const [coverage, page] = await Promise.all([
            this.reader.coverage(PEERS),
            this.archive.searchPage(q?.trim() ?? "", { since, until, limit, before }).catch((err: unknown) => {
                if (err instanceof Error && err.message.startsWith("잘못된 before")) throw new BadRequestException(err.message);
                throw err;
            }),
        ]);
        return {
            items: page.items.map(toWire),
            coverage: coverage ? { from: coverage.from.toISOString(), to: coverage.to.toISOString() } : null,
            ...(page.nextBefore ? { nextBefore: page.nextBefore } : {}),
        };
    }
}

/** date 는 from=to 의 줄임. 둘 다 없으면 400, from > to 면 400. */
function resolveRange(date?: string, from?: string, to?: string): { from: string; to: string } {
    if (date) {
        const d = assertYmd(date);
        return { from: d, to: d };
    }
    if (!from || !to) throw new BadRequestException("date= 또는 from=&to= 가 필요합니다");
    const f = assertYmd(from, "from");
    const t = assertYmd(to, "to");
    if (f > t) throw new BadRequestException(`from(${f}) 이 to(${t}) 보다 뒤입니다`);
    return { from: f, to: t };
}

function resolveLimit(raw?: string): number {
    if (raw === undefined || raw === "") return DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new BadRequestException(`limit 은 양의 정수여야 합니다: ${raw}`);
    return Math.min(n, MAX_LIMIT);
}
