// HTS 뉴스 피드 — 경로의 날짜(그리고 종목) 기준 헤드라인을 최신순으로, (date, srno) 커서로 과거를 더 가져온다.
// 커서 전진 규칙은 순수 함수로 떼어 값으로 잠근다 — 페이징이 깨지면 "더 가져오기가 안 됨"으로만 보여 조용히 썩는다.
import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNewsData } from "../market/MarketProvider.js";
import { kstToday } from "../market/domain.js";
import type { HtsCursor, HtsNewsItem } from "../market/types.js";

/** 한 장 크기(커서로 더 가져올 때, 그리고 "그 날 전체"가 아닌 첫 장). */
export const HTS_PAGE = 30;

/**
 * 다음 커서 — 지금까지 받은 가장 과거 항목의 (date, srno). undefined = 과거 소진(버튼을 숨긴다).
 *  · dayInitial(종목+무키워드의 첫 장 = 서버가 "그 날 전체"를 준다)은 길이와 무관하게 계속 — 짧아도 과거는 남아 있다.
 *  · 그 밖의 장은 limit 미만이면 소진.
 *  · 받은 장이 전부 비었어도 (date, "0") 으로 과거로는 걸을 수 있다(그 날이 비었을 뿐).
 */
export function htsNextCursor(
    lastPage: readonly Pick<HtsNewsItem, "date" | "srno">[],
    allPages: readonly (readonly Pick<HtsNewsItem, "date" | "srno">[])[],
    opts: { date: string; dayInitial: boolean; pageSize: number },
): HtsCursor | undefined {
    if (!opts.dayInitial && lastPage.length < opts.pageSize) return undefined;
    for (let i = allPages.length - 1; i >= 0; i--) {
        const oldest = allPages[i].at(-1);
        if (oldest) return { date: oldest.date, srno: oldest.srno };
    }
    return { date: opts.date, srno: "0" };
}


/**
 * HTS 헤드라인 피드. code "" = 전체 시황. keyword "" = 기본 피드.
 * 시각은 키에 넣지 않는다 — 시각이 바뀌어도 다시 받지 않고 화면에서 경계만 옮긴다.
 */
export function useHtsNewsFeed(args: { code: string; date: string; keyword: string; enabled: boolean }) {
    const port = useNewsData();
    const { code, date, keyword, enabled } = args;
    const q = useInfiniteQuery({
        queryKey: ["hts-news", code, date, keyword],
        initialPageParam: null as HtsCursor | null,
        queryFn: ({ pageParam, signal }) =>
            port.htsNews({ code: code || undefined, q: keyword || undefined, date, before: pageParam, limit: HTS_PAGE }, signal),
        getNextPageParam: (lastPage, allPages) =>
            htsNextCursor(lastPage, allPages, { date, dayInitial: code !== "" && !keyword && allPages.length === 1, pageSize: HTS_PAGE }),
        enabled,
        // 과거 날짜의 헤드라인은 바뀌지 않는다. 오늘은 수집이 채우는 중일 수 있어 1분 뒤 재조회를 허용한다.
        staleTime: date < kstToday() ? Infinity : 60_000,
    });
    const items = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
    return { q, items };
}
