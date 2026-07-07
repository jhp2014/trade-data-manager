// /news/telegram 조회 클라이언트 — 등록 방 전체에 키워드 fan-out, 하루 단위. wire 타입은 contracts/wire 공유.
// HTS(NewsHeadline)와 별개 소스라 wire 타입도 별개(본문 전문 + 방 + 링크).
import type { TelegramNewsPage } from "@trade-data-manager/wire";

export type { TelegramNewsItem, TelegramNewsPage } from "@trade-data-manager/wire";

export async function fetchTelegramNews(args: { q: string; date: string; beforeDate?: string }): Promise<TelegramNewsPage> {
    const qs = new URLSearchParams({ q: args.q, date: args.date });
    if (args.beforeDate) qs.set("beforeDate", args.beforeDate); // 이 날짜 이전을 하루씩("더보기")
    const res = await fetch(`/api/news/telegram?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /news/telegram ${res.status}: ${body}`);
    }
    return res.json() as Promise<TelegramNewsPage>;
}
