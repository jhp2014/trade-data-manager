// /review-points 계약 — 복기 타점(자연키 stockCode·date·time). 저장/조회 값타입은 core/market 재노출.
import type { ReviewPoint, ReviewPointListItem } from "@trade-data-manager/market";

export type { ReviewPoint, ReviewPointListItem };

/** POST /review-points 요청(upsert) 바디. */
export interface UpsertReviewPointInput {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
    type?: string; // 셋업 유형 라벨(선택)
    outcome?: string; // 트레이드 결과(선택)
    memo?: string;
}
