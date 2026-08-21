// /review-points 계약 — 복기 타점(자연키 stockCode·date·time). 저장/조회 값타입은 core/market 재노출.
// 전량 피드(/all)도 ReviewPoint 그대로다 — 종목명은 클라 부팅 사전(stock-master)이 단일 출처.
import type { ReviewPoint } from "@trade-data-manager/market";

export type { ReviewPoint };

/** POST /review-points 요청(upsert) 바디. */
export interface UpsertReviewPointInput {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
    outcome?: string; // 트레이드 결과(선택)
    memo?: string;
}
