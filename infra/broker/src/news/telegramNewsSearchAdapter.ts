// infra/broker/news/telegramNewsSearchAdapter — Telegram 단독 NewsChannelSearch.
// GramJS 클라이언트(방 검색)를 도메인 NewsItem 으로 매핑. peer→표시명은 주입된 레지스트리로 해석.
import type { NewsChannelSearch, NewsChannelSearchQuery, NewsItem } from "@trade-data-manager/market";
import type { TelegramMessage, TelegramSearchOptions } from "@trade-data-manager/telegram";

/** 어댑터가 필요로 하는 최소 표면(테스트 스텁 주입 가능). Telegram 이 구조적으로 만족. */
export interface TelegramSearchSource {
    searchChannel(peer: string, query: string, opts?: TelegramSearchOptions): Promise<TelegramMessage[]>;
}

/** 본문에서 첫 http(s) 링크 추출(공백 전까지). 없으면 undefined. */
const URL_RE = /https?:\/\/\S+/;
/** 줄 전체가 URL 하나뿐인지(=사람이 쓴 텍스트 없음). */
const URL_ONLY_LINE = /^https?:\/\/\S+$/;

/** 사람이 쓴 본문 줄이 하나라도 있나(URL-only 줄 제외). */
function hasBodyText(text: string): boolean {
    return text.split("\n").some((l) => {
        const t = l.trim();
        return t.length > 0 && !URL_ONLY_LINE.test(t);
    });
}

export class TelegramNewsSearchAdapter implements NewsChannelSearch {
    constructor(
        private readonly tg: TelegramSearchSource,
        /** peer → 방 표시명. 없는 peer 는 peer 문자열을 그대로 표시명으로. */
        private readonly labels: ReadonlyMap<string, string>,
    ) {}

    async search(query: string, opts: NewsChannelSearchQuery): Promise<NewsItem[]> {
        const messages = await this.tg.searchChannel(opts.channel, query, {
            since: opts.since,
            until: opts.until,
            limit: opts.limit,
        });
        const channel = this.labels.get(opts.channel) ?? opts.channel;

        return messages
            // 본문도 미리보기 제목도 없으면(서비스/미디어-only) 제외.
            .filter((m) => m.text.trim().length > 0 || !!m.webpage?.title)
            .map((m) => {
                // URL-only 메시지면 사람이 본 "기사 제목"은 본문이 아니라 링크 미리보기에 있다.
                const text = hasBodyText(m.text)
                    ? m.text
                    : (m.webpage?.title ?? m.webpage?.description ?? m.text);
                const url = m.webpage?.url ?? m.text.match(URL_RE)?.[0];
                return {
                    source: "telegram" as const,
                    channel,
                    at: m.date,
                    text,
                    url,
                    ref: `${opts.channel}#${m.id}`,
                };
            });
    }
}
