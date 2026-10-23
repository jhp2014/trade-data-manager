// GET /news/telegram/archive 조립 — tdm api telegramArchive.controller 에서 이식(결 그대로, DB 아카이브만).
// 포트 둘(searchPage·coverage)만 주입받는다 — peers·labels 는 wiring(main.ts)이 고정하므로 여긴 순수 조립.
import { kstDayBounds, type NewsItem } from "@trade-data-manager/market";
import type { TelegramArchivePage, TelegramNewsItem } from "@trade-data-manager/wire";
import { BadRequest, assertYmd } from "./validation.js";

const DEFAULT_LIMIT = 2000; // 하루 9방 ~480건 — 보통 한 번에 끝난다.
const MAX_LIMIT = 5000;

export interface TelegramArchivePorts {
    /** 아카이브 커서 페이지 검색 — core ArchiveNewsSearchService.searchPage. 잘못된 before 는 throw(400 재료). */
    searchPage(
        query: string,
        opts: { since?: Date; until?: Date; limit: number; before?: string },
    ): Promise<{ items: NewsItem[]; nextBefore?: string }>;
    /** 등록 방 전체의 coverage — peers 는 wiring 이 고정, channels 는 방별 최과거(표시명 — wiring 이 peer 를 바꿔 준다). null = sync 완주 전. */
    coverage(): Promise<{ from: Date; to: Date; channels: { channel: string; from: Date }[] } | null>;
}

export interface TelegramArchiveQuery {
    date?: string;
    from?: string;
    to?: string;
    q?: string;
    limit?: string;
    before?: string;
}

function toWire(n: NewsItem): TelegramNewsItem {
    return {
        channel: n.channel,
        at: n.at.toISOString(),
        text: n.text,
        url: n.url,
        ref: n.ref,
        ...(n.links ? { links: n.links } : {}),
        ...(n.preview ? { preview: n.preview } : {}),
    };
}

export async function telegramArchivePage(ports: TelegramArchivePorts, query: TelegramArchiveQuery): Promise<TelegramArchivePage> {
    const range = resolveRange(query.date, query.from, query.to);
    const limit = resolveLimit(query.limit);
    const { since } = kstDayBounds(range.from);
    const { until } = kstDayBounds(range.to);

    const [coverage, page] = await Promise.all([
        ports.coverage(),
        ports.searchPage(query.q?.trim() ?? "", { since, until, limit, before: query.before }).catch((err: unknown) => {
            if (err instanceof Error && err.message.startsWith("잘못된 before")) throw new BadRequest(err.message);
            throw err;
        }),
    ]);
    return {
        items: page.items.map(toWire),
        coverage: coverage
            ? {
                  from: coverage.from.toISOString(),
                  to: coverage.to.toISOString(),
                  channels: coverage.channels.map((c) => ({ channel: c.channel, from: c.from.toISOString() })),
              }
            : null,
        ...(page.nextBefore ? { nextBefore: page.nextBefore } : {}),
    };
}

/** date 는 from=to 의 줄임. 둘 다 없으면 400, from > to 면 400. */
function resolveRange(date?: string, from?: string, to?: string): { from: string; to: string } {
    if (date) {
        const d = assertYmd(date);
        return { from: d, to: d };
    }
    if (!from || !to) throw new BadRequest("date= 또는 from=&to= 가 필요합니다");
    const f = assertYmd(from, "from");
    const t = assertYmd(to, "to");
    if (f > t) throw new BadRequest(`from(${f}) 이 to(${t}) 보다 뒤입니다`);
    return { from: f, to: t };
}

function resolveLimit(raw?: string): number {
    if (raw === undefined || raw === "") return DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new BadRequest(`limit 은 양의 정수여야 합니다: ${raw}`);
    return Math.min(n, MAX_LIMIT);
}
