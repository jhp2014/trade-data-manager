// 당일 종목 코멘트(DB) 조회·저장 클라이언트. wire 타입(DailyCommentDto·UpsertDailyCommentInput) 공유.
// (date, code) 자연키 — 종목 우클릭 팝업에서 편집. 빈 코멘트 저장 = 삭제(서버 규약).
import type { DailyCommentDto, DailyCommentListItem, UpsertDailyCommentInput } from "@trade-data-manager/wire";
import { apiGet, apiPost } from "./http.js";

export type { DailyCommentDto, DailyCommentListItem, UpsertDailyCommentInput } from "@trade-data-manager/wire";

/** 전 코멘트 행 — 클라 큐레이션 복제본의 테이블 로드(존재 지도의 "코" 배지 재료). */
export const fetchAllDailyComments = (signal?: AbortSignal): Promise<DailyCommentListItem[]> =>
    apiGet<DailyCommentListItem[]>("comment/all", undefined, signal);

/** 그 (날짜,종목)의 코멘트 — 없으면 null(프리필용). */
export const fetchDailyComment = (date: string, code: string, signal?: AbortSignal): Promise<DailyCommentDto | null> =>
    apiGet<DailyCommentDto | null>("comment", { date, code }, signal);

/** upsert — comment 가 비면 서버가 삭제 처리. */
export const saveDailyComment = (input: UpsertDailyCommentInput): Promise<{ ok: true }> =>
    apiPost<{ ok: true }>("comment", input);
