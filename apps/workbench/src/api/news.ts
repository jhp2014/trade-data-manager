// /news/hts 조회 클라이언트 — HTS(시황) 헤드라인. wire 타입(HtsNewsItem)은 contracts/wire 공유.
// 항상 최신순. 초기(before 없음)=그 날 전체, 커서(before 있음)=그보다 과거 최대 limit 건("더 가져오기").
import type { HtsNewsItem } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { HtsNewsItem } from "@trade-data-manager/wire";

/** 복합 커서 — 이 지점보다 과거(엄격 미만)만. oldest 항목의 (date, srno). 클라 페이징 파라미터(와이어 아님). */
export interface HeadlineCursor {
    date: string;
    srno: string;
}

export function fetchHtsNews(args: { code: string; date: string; before: HeadlineCursor | null; limit: number }, signal?: AbortSignal): Promise<HtsNewsItem[]> {
    const query: Record<string, string> = { code: args.code, date: args.date, limit: String(args.limit) };
    if (args.before) {
        query.beforeDate = args.before.date;
        query.beforeSrno = args.before.srno;
    }
    return apiGet<HtsNewsItem[]>("news/hts", query, signal);
}
