import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { NewsItem, NewsSearcher } from "@trade-data-manager/market";
import { addDaysYmd } from "@trade-data-manager/market";
import type { TelegramNewsItem, TelegramNewsPage } from "@trade-data-manager/wire";
import { NEWS_SEARCHER } from "../tokens.js";
import { assertYmd } from "../validation.js";

const DAY_LIMIT = 200; // 하루 전체를 담을 방당 상한(실제 한계는 since=하루 시작 경계).
const THRESHOLD = 5; // 더보기 한 클릭 = 이 건수를 넘길 때까지 과거 날짜를 하루씩 누적.
const MAX_WALK_DAYS = 7; // 더보기 한 클릭이 걸어갈 최대 날짜 수(빈 구간 폭주 방지).

// NewsItem → 표시용 wire(TelegramNewsItem, contracts/wire). at 은 절대시각 ISO(표시계층에서 KST 포맷).
function toWire(n: NewsItem): TelegramNewsItem {
    return { channel: n.channel, at: n.at.toISOString(), text: n.text, url: n.url, ref: n.ref };
}

// 날짜 ± n일은 core/market addDaysYmd 단일 출처 사용.

// GET /news/telegram?q&date[&beforeDate] — 등록 방 전체 키워드 fan-out, 하루 단위로.
//  · q 생략/빈 문자열: 검색 없이 방들의 최근 메시지 피드("전체 최근" 모드, 방당 DAY_LIMIT 상한).
//  · beforeDate 없음: focus.date 하루 전체(초기).
//  · beforeDate 있음: 그 날짜 이전을 하루씩 통으로, 누적 > THRESHOLD 까지(또는 MAX_WALK_DAYS). "더보기".
// 하루 단위라 방마다 since=하루시작 경계까지 완주 → 구간 누락 없음(count 커서의 skip 문제 회피).
@Controller("news/telegram")
export class TelegramNewsController {
    constructor(@Inject(NEWS_SEARCHER) private readonly searcher: NewsSearcher) {}

    @Get()
    async search(
        @Query("q") q?: string,
        @Query("date") date?: string,
        @Query("beforeDate") beforeDate?: string,
    ): Promise<TelegramNewsPage> {
        const query = q?.trim() ?? ""; // "" = 최근 전체 피드(검색 없이)
        const validDate = assertYmd(date);

        if (!beforeDate) {
            const items = await this.searchDay(query, validDate);
            return { items: items.map(toWire), oldestDate: validDate };
        }

        assertYmd(beforeDate, "beforeDate");
        const acc: NewsItem[] = [];
        let day = addDaysYmd(beforeDate, -1);
        let oldest = beforeDate;
        for (let i = 0; i < MAX_WALK_DAYS; i++) {
            acc.push(...(await this.searchDay(query, day)));
            oldest = day;
            if (acc.length > THRESHOLD) break;
            day = addDaysYmd(day, -1);
        }
        acc.sort((a, b) => b.at.getTime() - a.at.getTime()); // 여러 날 섞였으니 최신순 재정렬
        return { items: acc.map(toWire), oldestDate: oldest };
    }

    // 한 날짜(KST 하루) 전체 검색 — 방마다 하루 경계까지 완주.
    private searchDay(query: string, day: string): Promise<NewsItem[]> {
        const since = new Date(`${day}T00:00:00+09:00`);
        const until = new Date(`${day}T23:59:59+09:00`);
        return this.searcher.search(query, { since, until, limitPerChannel: DAY_LIMIT });
    }
}
