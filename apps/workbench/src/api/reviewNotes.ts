// /review-notes 조회 — 복기 vault 의 타점 노트(api 가 VAULT_DIR 을 읽는다. 클라는 경로를 모른다).
import type { ReviewNotesResponse } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { ReviewNote, ReviewNotesResponse } from "@trade-data-manager/wire";

export const fetchReviewNotes = (signal?: AbortSignal): Promise<ReviewNotesResponse> =>
    apiGet<ReviewNotesResponse>("review-notes", undefined, signal);
