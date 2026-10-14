import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { ArchiveCoverage, ChannelMessageReader, NewsItem, NewsSearcher } from "@trade-data-manager/market";
import { addDaysYmd, isDayCovered, kstDayBounds } from "@trade-data-manager/market";
import { NEWS_CHANNELS } from "@trade-data-manager/telegram";
import type { TelegramNewsItem, TelegramNewsPage } from "@trade-data-manager/wire";
import { ARCHIVE_NEWS_SEARCHER, CHANNEL_MESSAGE_READER, NEWS_SEARCHER } from "../tokens.js";
import { assertYmd } from "../validation.js";

const DAY_LIMIT = 200; // 하루 전체를 담을 방당 상한(실제 한계는 since=하루 시작 경계).
const THRESHOLD = 5; // 더보기 한 클릭 = 이 건수를 넘길 때까지 과거 날짜를 하루씩 누적.
const MAX_WALK_DAYS = 7; // 더보기 한 클릭이 걸어갈 최대 날짜 수(빈 구간 폭주 방지).
const PEERS = NEWS_CHANNELS.map((c) => c.peer);

// NewsItem → 표시용 wire(TelegramNewsItem, contracts/wire). at 은 절대시각 ISO(표시계층에서 KST 포맷).
function toWire(n: NewsItem): TelegramNewsItem {
    return { channel: n.channel, at: n.at.toISOString(), text: n.text, url: n.url, ref: n.ref, ...(n.links ? { links: n.links } : {}), ...(n.preview ? { preview: n.preview } : {}) };
}

// GET /news/telegram?q&date[&beforeDate] — 등록 방 전체 키워드 검색, 하루 단위로.
//  · q 생략/빈 문자열: 검색 없이 방들의 최근 메시지 피드("전체 최근" 모드, 방당 DAY_LIMIT 상한).
//  · beforeDate 없음: focus.date 하루 전체(초기).
//  · beforeDate 있음: 그 날짜 이전을 하루씩 통으로, 누적 > THRESHOLD 까지(또는 MAX_WALK_DAYS). "더보기".
// 하루 단위라 방마다 since=하루시작 경계까지 완주 → 구간 누락 없음(count 커서의 skip 문제 회피).
// 소스 라우팅(날짜별): 그 하루가 아카이브 coverage 안에 통째로 들면 DB(부분일치 검색), 아니면(오늘·미수집·coverage 조회
// 실패) 라이브 MTProto(토큰 접두 검색). 둘 다 같은 NewsItem·봉투라 클라는 어느 쪽인지 모른다 — 검색 의미 차이는 여기서 끝.
@Controller("news/telegram")
export class TelegramNewsController {
    constructor(
        @Inject(NEWS_SEARCHER) private readonly live: NewsSearcher,
        @Inject(ARCHIVE_NEWS_SEARCHER) private readonly archive: NewsSearcher,
        @Inject(CHANNEL_MESSAGE_READER) private readonly reader: ChannelMessageReader,
    ) {}

    @Get()
    async search(
        @Query("q") q?: string,
        @Query("date") date?: string,
        @Query("beforeDate") beforeDate?: string,
    ): Promise<TelegramNewsPage> {
        const query = q?.trim() ?? ""; // "" = 최근 전체 피드(검색 없이)
        const validDate = assertYmd(date);
        const coverage = await this.coverageOrNull();

        if (!beforeDate) {
            const items = await this.searchDay(query, validDate, coverage);
            return { items: items.map(toWire), oldestDate: validDate };
        }

        assertYmd(beforeDate, "beforeDate");
        const acc: NewsItem[] = [];
        let day = addDaysYmd(beforeDate, -1);
        let oldest = beforeDate;
        for (let i = 0; i < MAX_WALK_DAYS; i++) {
            acc.push(...(await this.searchDay(query, day, coverage)));
            oldest = day;
            if (acc.length > THRESHOLD) break;
            day = addDaysYmd(day, -1);
        }
        acc.sort((a, b) => b.at.getTime() - a.at.getTime()); // 여러 날 섞였으니 최신순 재정렬
        return { items: acc.map(toWire), oldestDate: oldest };
    }

    // coverage 조회 실패(테이블 없음 — 마이그 전 등)는 라이브 폴백으로 흡수. 요청당 한 번만 묻는다.
    private async coverageOrNull(): Promise<ArchiveCoverage | null> {
        try {
            return await this.reader.coverage(PEERS);
        } catch (err) {
            console.warn(`[news/telegram] 아카이브 coverage 조회 실패 → 라이브: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    // 한 날짜(KST 하루) 전체 검색 — 방마다 하루 경계까지 완주. 통째로 수집된 날만 DB, DB 가 실패하면 그 날은 라이브로.
    private async searchDay(query: string, day: string, coverage: ArchiveCoverage | null): Promise<NewsItem[]> {
        const { since, until } = kstDayBounds(day);
        const opts = { since, until, limitPerChannel: DAY_LIMIT };
        if (isDayCovered(day, coverage, PEERS.length)) {
            try {
                return await this.archive.search(query, opts);
            } catch (err) {
                console.warn(`[news/telegram] 아카이브 검색 실패(${day}) → 라이브: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return this.live.search(query, opts);
    }
}
