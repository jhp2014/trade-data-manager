// /news/hts 조회 클라이언트 — HTS(시황) 헤드라인. wire 타입(HtsNewsItem)은 contracts/wire 공유.
// 항상 최신순. 초기(before 없음)=그 날 전체, 커서(before 있음)=그보다 과거 최대 limit 건("더 가져오기").
import type { HtsNewsItem } from "@trade-data-manager/wire";

export type { HtsNewsItem } from "@trade-data-manager/wire";

/** 복합 커서 — 이 지점보다 과거(엄격 미만)만. oldest 항목의 (date, srno). 클라 페이징 파라미터(와이어 아님). */
export interface HeadlineCursor {
    date: string;
    srno: string;
}

export async function fetchHtsNews(args: {
    code: string;
    date: string;
    before: HeadlineCursor | null;
    limit: number;
}): Promise<HtsNewsItem[]> {
    const qs = new URLSearchParams({ code: args.code, date: args.date, limit: String(args.limit) });
    if (args.before) {
        qs.set("beforeDate", args.before.date);
        qs.set("beforeSrno", args.before.srno);
    }
    const res = await fetch(`/api/news/hts?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /news/hts ${res.status}: ${body}`);
    }
    return res.json() as Promise<HtsNewsItem[]>;
}
