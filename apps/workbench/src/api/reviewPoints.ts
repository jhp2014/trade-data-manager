// 복기 타점 CRUD 클라이언트. wire 타입(ReviewPoint·UpsertReviewPointInput)은 contracts/wire 공유.
// 자연키(code·date·time)라 삭제도 자연키로 지목. 읽기는 전량 피드 하나 — per-chart 파생은 클라 셀렉터(useChartPoints).
import type { ReviewPoint, UpsertReviewPointInput } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiDelete } from "./http.js";

export type { ReviewPoint, UpsertReviewPointInput } from "@trade-data-manager/wire";

export const upsertReviewPoint = (point: UpsertReviewPointInput): Promise<ReviewPoint> =>
    apiPost<ReviewPoint>("review-points", point);

export const removeReviewPoint = (code: string, date: string, time: string): Promise<void> =>
    apiDelete("review-points", { code, date, time });

/** 전체 타점 — 클라 큐레이션 복제본의 테이블 로드. 날짜 내림차순, 같은 날 시각 오름차순. 종목명은 부팅 사전(stock-master). */
export const fetchAllPoints = (signal?: AbortSignal): Promise<ReviewPoint[]> => apiGet<ReviewPoint[]>("review-points/all", undefined, signal);
