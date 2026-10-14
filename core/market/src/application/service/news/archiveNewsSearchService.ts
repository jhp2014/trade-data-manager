// ArchiveNewsSearchService — DB 아카이브 위의 NewsSearcher. 라이브(NewsSearchService)와 같은 NewsItem 을 내므로
// api 가 날짜별로 둘을 바꿔 끼워도 클라는 모른다. 표시 규칙(presentNewsText)·ref(`${peer}#${msgId}`)가 라이브와 같아
// dedup·앵커가 그대로 돈다. 검색 의미만 다르다: 라이브 = 토큰 접두, 여긴 부분일치(서버 안의 차이, 사용자 수용).
import { linksFromEntities, presentNewsText, type NewsItem } from "#domain";
import type { ChannelMessageReader, NewsSearcher, NewsSearchOptions } from "#port/query";

export interface ArchiveNewsSearchDeps {
    reader: ChannelMessageReader;
    /** peer → 방 표시명. 없는 peer 는 peer 그대로. */
    labels: ReadonlyMap<string, string>;
    /** 전체 상한(기본 5000 — 하루 9방 ~480건이라 넉넉). */
    limit?: number;
}

const DEFAULT_LIMIT = 5000;

/** 공백으로 토큰화(라이브의 "여러 단어 = AND" 와 같은 뜻). */
export function tokenizeQuery(query: string): string[] {
    return query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
}

export class ArchiveNewsSearchService implements NewsSearcher {
    constructor(private readonly deps: ArchiveNewsSearchDeps) {}

    async search(query: string, opts?: NewsSearchOptions): Promise<NewsItem[]> {
        const rows = await this.deps.reader.searchMessages({
            peers: [...this.deps.labels.keys()],
            tokens: tokenizeQuery(query),
            since: opts?.since,
            until: opts?.until,
            limit: this.deps.limit ?? DEFAULT_LIMIT,
        });
        const out: NewsItem[] = [];
        for (const m of rows) {
            const shown = presentNewsText(m.text, m.webpage);
            if (!shown) continue;
            const links = shown.fromBody ? linksFromEntities(m.entities) : undefined;
            out.push({
                source: "telegram",
                channel: this.deps.labels.get(m.peer) ?? m.peer,
                at: m.postedAt,
                text: shown.text,
                url: shown.url,
                ref: `${m.peer}#${m.msgId}`,
                ...(links ? { links } : {}),
            });
        }
        return out;
    }
}
