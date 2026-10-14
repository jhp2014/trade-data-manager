// ArchiveNewsSearchService — DB 아카이브 위의 NewsSearcher. 라이브(NewsSearchService)와 같은 NewsItem 을 내므로
// api 가 날짜별로 둘을 바꿔 끼워도 클라는 모른다. 표시 규칙(presentNewsText)·ref(`${peer}#${msgId}`)가 라이브와 같아
// dedup·앵커가 그대로 돈다. 검색 의미만 다르다: 라이브 = 토큰 접두, 여긴 부분일치(서버 안의 차이, 사용자 수용).
// searchPage = 아카이브 전용 입구(/news/telegram/archive): 커서 페이징 + "더 있음" 판정. 커서는 (at, msgId) 문자열.
import { linksFromEntities, presentNewsText, previewOf, type NewsItem } from "#domain";
import type { ArchivedMessage, ChannelMessageReader, NewsSearcher, NewsSearchOptions } from "#port/query";

export interface ArchiveNewsSearchDeps {
    reader: ChannelMessageReader;
    /** peer → 방 표시명. 없는 peer 는 peer 그대로. */
    labels: ReadonlyMap<string, string>;
    /** 전체 상한(기본 5000 — 하루 9방 ~480건이라 넉넉). */
    limit?: number;
}

export interface ArchivePageOptions {
    since?: Date;
    until?: Date;
    /** 이 페이지 최대 건수. */
    limit: number;
    /** 직전 페이지의 nextBefore — 이보다 엄격히 과거만. */
    before?: string;
}

export interface ArchivePage {
    items: NewsItem[];
    /** limit 에 걸려 더 있을 때만 — 다음 요청의 before. */
    nextBefore?: string;
}

const DEFAULT_LIMIT = 5000;

/** 공백으로 토큰화(라이브의 "여러 단어 = AND" 와 같은 뜻). */
export function tokenizeQuery(query: string): string[] {
    return query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
}

/** 커서 = `${ISO 시각}#${msgId}` — (posted_at, msg_id) 내림차순의 "이 항목보다 과거". */
export function encodeCursor(m: { postedAt: Date; msgId: number }): string {
    return `${m.postedAt.toISOString()}#${m.msgId}`;
}

export function parseCursor(s: string): { postedAt: Date; msgId: number } | null {
    const i = s.lastIndexOf("#");
    if (i <= 0) return null;
    const postedAt = new Date(s.slice(0, i));
    const msgId = Number(s.slice(i + 1));
    if (Number.isNaN(postedAt.getTime()) || !Number.isInteger(msgId) || msgId < 0) return null;
    return { postedAt, msgId };
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
        return this.toItems(rows);
    }

    /** 커서 페이지 — limit+1 로 읽어 "더 있음"을 판정한다. 잘못된 커서는 throw(400 재료). */
    async searchPage(query: string, opts: ArchivePageOptions): Promise<ArchivePage> {
        const before = opts.before === undefined ? undefined : parseCursor(opts.before);
        if (opts.before !== undefined && before === null) throw new Error(`잘못된 before 커서: ${opts.before}`);
        const rows = await this.deps.reader.searchMessages({
            peers: [...this.deps.labels.keys()],
            tokens: tokenizeQuery(query),
            since: opts.since,
            until: opts.until,
            before: before ?? undefined,
            limit: opts.limit + 1,
        });
        const page = rows.slice(0, opts.limit);
        const items = this.toItems(page);
        const last = page[page.length - 1];
        return rows.length > opts.limit && last ? { items, nextBefore: encodeCursor(last) } : { items };
    }

    private toItems(rows: ArchivedMessage[]): NewsItem[] {
        const out: NewsItem[] = [];
        for (const m of rows) {
            const shown = presentNewsText(m.text, m.webpage);
            if (!shown) continue;
            const links = shown.fromBody ? linksFromEntities(m.entities) : undefined;
            const preview = previewOf(m.webpage);
            out.push({
                source: "telegram",
                channel: this.deps.labels.get(m.peer) ?? m.peer,
                at: m.postedAt,
                text: shown.text,
                url: shown.url,
                ref: `${m.peer}#${m.msgId}`,
                ...(links ? { links } : {}),
                ...(preview ? { preview } : {}),
            });
        }
        return out;
    }
}
