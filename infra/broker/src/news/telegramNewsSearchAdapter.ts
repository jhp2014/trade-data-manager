// infra/broker/news/telegramNewsSearchAdapter — Telegram 단독 NewsChannelSearch.
// GramJS 클라이언트(방 검색)를 도메인 NewsItem 으로 매핑. peer→표시명은 주입된 레지스트리로 해석.
// "본문이냐 미리보기 제목이냐"는 core presentNewsText 한 벌 — 아카이브(DB) 읽기와 같은 글을 보여 주기 위해.
import {
    linksFromEntities,
    presentNewsText,
    type NewsChannelSearch,
    type NewsChannelSearchQuery,
    type NewsItem,
} from "@trade-data-manager/market";
import type { TelegramMessage, TelegramSearchOptions } from "@trade-data-manager/telegram";

/** 어댑터가 필요로 하는 최소 표면(테스트 스텁 주입 가능). Telegram 이 구조적으로 만족. */
export interface TelegramSearchSource {
    searchChannel(peer: string, query: string, opts?: TelegramSearchOptions): Promise<TelegramMessage[]>;
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

        const out: NewsItem[] = [];
        for (const m of messages) {
            const shown = presentNewsText(m.text, m.webpage);
            if (!shown) continue; // 본문도 미리보기 제목도 없음(서비스/미디어-only)
            // 숨은 링크는 text 가 원문 본문일 때만 — 제목으로 대체되면 offset 이 무의미.
            const links = shown.fromBody ? linksFromEntities(m.entities) : undefined;
            out.push({
                source: "telegram",
                channel,
                at: m.date,
                text: shown.text,
                url: shown.url,
                ref: `${opts.channel}#${m.id}`,
                ...(links ? { links } : {}),
            });
        }
        return out;
    }
}
