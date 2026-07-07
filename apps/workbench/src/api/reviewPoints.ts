// 복기 타점 CRUD 클라이언트. wire 타입(ReviewPoint·ReviewPointListItem·UpsertReviewPointInput)은 contracts/wire 공유.
// 자연키(code·date·time)라 삭제도 자연키로 지목. 의미(가설·태그)는 하류 hypothesis 가 caseId 로 붙인다.
import type { ReviewPoint, ReviewPointListItem, UpsertReviewPointInput } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiDelete } from "./http.js";

export type { ReviewPoint, ReviewPointListItem, UpsertReviewPointInput } from "@trade-data-manager/wire";

export const fetchReviewPoints = (code: string, date: string, signal?: AbortSignal): Promise<ReviewPoint[]> =>
    apiGet<ReviewPoint[]>("review-points", { code, date }, signal);

export const upsertReviewPoint = (point: UpsertReviewPointInput): Promise<ReviewPoint> =>
    apiPost<ReviewPoint>("review-points", point);

export const removeReviewPoint = (code: string, date: string, time: string): Promise<void> =>
    apiDelete("review-points", { code, date, time });

/** 전체 타점 + 종목명 — 월 그룹은 클라. 날짜 내림차순, 같은 날 시각 오름차순. */
export const fetchAllPoints = (signal?: AbortSignal): Promise<ReviewPointListItem[]> => apiGet<ReviewPointListItem[]>("review-points/all", undefined, signal);
