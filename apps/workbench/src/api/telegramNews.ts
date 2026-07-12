// /news/telegram 조회 클라이언트 — 등록 방 전체에 키워드 fan-out, 하루 단위. wire 타입은 contracts/wire 공유.
// q 빈 문자열/생략 = 검색 없이 최근 메시지 피드("전체 최근").
import type { TelegramNewsPage } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { TelegramNewsItem, TelegramNewsPage } from "@trade-data-manager/wire";

export function fetchTelegramNews(args: { q?: string; date: string; beforeDate?: string }, signal?: AbortSignal): Promise<TelegramNewsPage> {
    const query: Record<string, string> = { date: args.date };
    if (args.q) query.q = args.q;
    if (args.beforeDate) query.beforeDate = args.beforeDate; // 이 날짜 이전을 하루씩("더보기")
    return apiGet<TelegramNewsPage>("news/telegram", query, signal);
}
