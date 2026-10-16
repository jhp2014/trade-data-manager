// 텔레그램 피드 — 경로 날짜의 메시지(아카이브, tdm DB). 날짜 · 검색어가 바뀌면 저절로 다시 읽는다(DB 라 요청 제한이 없다).
// 더보기 = 바로 앞 한 주씩 거슬러(수집 범위의 시작에서 멈춤) — news/telegramNews.ts nextWindow.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTelegramData } from "../market/MarketProvider.js";
import type { TelegramArchivePage } from "../market/types.js";
import { coverageOf, nextWindow, type TgWindow } from "./telegramNews.js";

/** 한 번 받은 것 — 어느 구간을 받았는지 같이 둔다(다음 구간을 그것으로 정한다). */
export interface TgPage {
    window: TgWindow;
    page: TelegramArchivePage;
}

/**
 * 그날이 아직 다 안 들어왔으면(오늘 · 수집 시작일 · 수집기가 밀린 날) 잠시마다 다시 읽는다 — DB 라 싸다.
 * 빠짐없이 든 날은 다시 바뀌지 않는다(48시간 뒤 수정은 반영 안 됨 — 수집기 규칙). "오늘인가"가 아니라 수집 범위로 가른다.
 */
const FILLING_MS = 5 * 60_000;

/** 그날이 수집 범위에 빠짐없이 들었나 — 가장 최근에 받은 봉투의 수집 범위로. 아니면 잠시마다 다시 읽는다. */
export const filled = (date: string, pages: readonly TgPage[] | undefined): boolean => {
    const last = pages?.[pages.length - 1];
    return !!last && coverageOf(date, last.page.coverage).kind === "ok";
};

export function useTelegramFeed(date: string, q: string) {
    const port = useTelegramData();
    return useInfiniteQuery({
        queryKey: ["telegram-archive", date, q],
        queryFn: async ({ pageParam, signal }): Promise<TgPage> => ({ window: pageParam, page: await port.telegramArchive({ ...pageParam, q: q || undefined }, signal) }),
        initialPageParam: { from: date, to: date } as TgWindow,
        // 수집 범위는 가장 최근에 받은 봉투의 것(백필이 진행 중이면 매번 과거로 넓어진다).
        getNextPageParam: (last) => nextWindow(last.window, last.page, last.page.coverage),
        enabled: date !== "",
        staleTime: (query) => (filled(date, query.state.data?.pages) ? Infinity : FILLING_MS),
        refetchInterval: (query) => (filled(date, query.state.data?.pages) ? false : FILLING_MS),
    });
}
