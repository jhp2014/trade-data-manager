// /news/telegram 조회 클라이언트 — 등록 방 전체에 키워드 fan-out, 하루 단위.
// HTS(NewsHeadline)와 별개 소스라 wire 타입도 별개(본문 전문 + 방 + 링크).

export interface TelegramNewsItem {
    channel: string; // 방 표시명
    at: string; // ISO 절대시각(표시계층에서 KST 포맷)
    text: string; // 본문 전문(URL-only 메시지는 링크 프리뷰 제목이 승격됨)
    url?: string; // 대표 링크(있으면)
    ref: string; // `${peer}#${messageId}` — 고유 식별
}

// 봉투 — items + 이 페이지가 걸어간 가장 과거 날짜(다음 더보기 커서).
export interface TelegramNewsPage {
    items: TelegramNewsItem[];
    oldestDate: string;
}

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
