// /news/telegram 조회 클라이언트 — 등록 방 전체에 키워드 fan-out, 하루 단위. wire 타입은 contracts/wire 공유.
import type { TelegramNewsPage } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { TelegramNewsItem, TelegramNewsPage } from "@trade-data-manager/wire";

export function fetchTelegramNews(args: { q: string; date: string; beforeDate?: string }): Promise<TelegramNewsPage> {
    const query: Record<string, string> = { q: args.q, date: args.date };
    if (args.beforeDate) query.beforeDate = args.beforeDate; // 이 날짜 이전을 하루씩("더보기")
    return apiGet<TelegramNewsPage>("news/telegram", query);
}
