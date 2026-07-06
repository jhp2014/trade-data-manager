// NewsSearchService — 키워드 1개를 등록된 방 전체에 fan-out 동시검색 → 합쳐 최신순(읽기 Query).
// 협력: NewsChannelSearch(방 1개 검색). 방 목록은 컴포지션이 주입(출처 고유 ref 목록).
// 한 방 실패(권한·삭제 등)는 격리 — 전체 결과를 죽이지 않고 그 방만 건너뛴다.
import type { NewsItem } from "#domain";
import type { NewsChannelSearch } from "#port/query";
import type { NewsSearcher, NewsSearchOptions } from "#port/query";
import { mapWithConcurrency } from "../../concurrency.js";

export interface NewsSearchDeps {
    source: NewsChannelSearch;
    /** 검색 대상 방 목록(불투명 ref). */
    channels: readonly string[];
    /** 동시 검색 방 수(기본 4). MTProto FLOOD 회피용 상한. */
    concurrency?: number;
    /** 한 방 검색 실패 알림(기본 console.warn). 격리는 유지. */
    onError?: (channel: string, err: unknown) => void;
}

const DEFAULT_CONCURRENCY = 4;

export class NewsSearchService implements NewsSearcher {
    constructor(private readonly deps: NewsSearchDeps) {}

    async search(query: string, opts?: NewsSearchOptions): Promise<NewsItem[]> {
        const { source, channels } = this.deps;
        const limit = this.deps.concurrency ?? DEFAULT_CONCURRENCY;
        const onError =
            this.deps.onError ??
            ((channel, err) =>
                console.warn(
                    `[news-search] 방 검색 실패(${channel}): ${err instanceof Error ? err.message : String(err)}`,
                ));

        const perChannel = await mapWithConcurrency(channels, limit, async (channel) => {
            try {
                return await source.search(query, {
                    channel,
                    since: opts?.since,
                    until: opts?.until,
                    limit: opts?.limitPerChannel,
                });
            } catch (err) {
                onError(channel, err);
                return [] as NewsItem[];
            }
        });

        return perChannel.flat().sort((a, b) => b.at.getTime() - a.at.getTime());
    }
}
