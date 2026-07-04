import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { NewsItem, NewsSearcher } from "@trade-data-manager/market";
import { NEWS_SEARCHER } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_LIMIT = 200; // 하루 전체를 담을 방당 상한(실제 한계는 since=하루 시작 경계).
const THRESHOLD = 5; // 더보기 한 클릭 = 이 건수를 넘길 때까지 과거 날짜를 하루씩 누적.
const MAX_WALK_DAYS = 7; // 더보기 한 클릭이 걸어갈 최대 날짜 수(빈 구간 폭주 방지).

// 표시용 wire — at 은 절대시각 ISO(표시계층에서 KST 포맷).
interface TelegramNewsWire {
    channel: string;
    at: string;
    text: string;
    url?: string;
    ref: string;
}
// 봉투 — items + 이 페이지가 걸어간 가장 과거 날짜(다음 더보기 커서). 빈 날은 클라가 모르므로 서버가 알려줌.
interface TelegramNewsPage {
    items: TelegramNewsWire[];
    oldestDate: string;
}

function toWire(n: NewsItem): TelegramNewsWire {
    return { channel: n.channel, at: n.at.toISOString(), text: n.text, url: n.url, ref: n.ref };
}

// "YYYY-MM-DD" ± n일. UTC 파싱/포맷으로 TZ 드리프트 없이 날짜 산술.
function addDaysStr(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

// GET /news/telegram?q&date[&beforeDate] — 등록 방 전체 키워드 fan-out, 하루 단위로.
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
        const query = q?.trim();
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        if (!query) return { items: [], oldestDate: date };

        if (!beforeDate) {
            const items = await this.searchDay(query, date);
            return { items: items.map(toWire), oldestDate: date };
        }

        if (!DATE_RE.test(beforeDate)) throw new BadRequestException("beforeDate 형식(YYYY-MM-DD)");
        const acc: NewsItem[] = [];
        let day = addDaysStr(beforeDate, -1);
        let oldest = beforeDate;
        for (let i = 0; i < MAX_WALK_DAYS; i++) {
            acc.push(...(await this.searchDay(query, day)));
            oldest = day;
            if (acc.length > THRESHOLD) break;
            day = addDaysStr(day, -1);
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
