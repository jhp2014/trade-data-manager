// 당일 종목 코멘트(DB) 조회·저장 클라이언트. wire 타입(DailyCommentListItem·UpsertDailyCommentInput) 공유.
// (date, code) 자연키 — 종목 우클릭 팝업에서 편집. 빈 코멘트 저장 = 삭제(서버 규약).
// 읽기는 전량 피드 하나 — (날짜,종목) 파생(프리필)은 클라 셀렉터(useDailyComment).
import type { DailyCommentListItem, UpsertDailyCommentInput } from "@trade-data-manager/wire";
import { apiGet, apiPost } from "./http.js";

export type { DailyCommentListItem, UpsertDailyCommentInput } from "@trade-data-manager/wire";

/** 전 코멘트 행 — 클라 큐레이션 복제본의 테이블 로드(존재 지도의 메모 배지·프리필 재료). */
export const fetchAllDailyComments = (signal?: AbortSignal): Promise<DailyCommentListItem[]> =>
    apiGet<DailyCommentListItem[]>("comment/all", undefined, signal);

/** upsert — comment 가 비면 서버가 삭제 처리. */
export const saveDailyComment = (input: UpsertDailyCommentInput): Promise<{ ok: true }> =>
    apiPost<{ ok: true }>("comment", input);
