// 실시간 뉴스 — apps/live(/live 프록시 → :3002) KIS 온디맨드. /api/news/hts(DB, 복기)와 같은
// 표시 계약(HtsNewsItem)이라 패널이 소스 무관하게 렌더. 페이징은 (date,time) 앵커 되감기(≤ 포함)
// — 경계 중복은 호출자가 srno 로 dedup.
import type { HtsNewsItem } from "@trade-data-manager/wire";

/** 시각 앵커 — 이 시각 이하(포함)부터 과거로 한 페이지(≤40). 생략=최신부터. */
export interface LiveNewsAnchor {
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
}

export async function fetchLiveNews(
    args: { code?: string; q?: string; before?: LiveNewsAnchor },
    signal?: AbortSignal,
): Promise<HtsNewsItem[]> {
    const query = new URLSearchParams();
    if (args.code) query.set("code", args.code);
    if (args.q) query.set("q", args.q);
    if (args.before) {
        query.set("beforeDate", args.before.date);
        query.set("beforeTime", args.before.time);
    }
    const res = await fetch(`/live/news?${query.toString()}`, { signal });
    if (!res.ok) throw new Error(`실시간 뉴스 ${res.status}`);
    return (await res.json()) as HtsNewsItem[];
}
