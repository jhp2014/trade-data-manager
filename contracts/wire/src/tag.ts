// /tags 계약 — 태그(명목형 분류). 도메인 값타입은 core/market 를 **재노출**(단일 출처).
// 부착은 review-points 계약과 분리한다: 태그 토글이 타점 목록 캐시를 흔들지 않고, 사전·부착만 따로 무효화된다.
// 부착이 두 벌인 이유: 타점 부착(타점 삼중키)과 **차트 부착**(종목·날짜 — 골격 분류용, 타점 없는 차트도 대상).
// 사전은 하나를 공유한다.
import type { Tag, TagAttachment, ChartTagAttachment } from "@trade-data-manager/market";

export type { Tag, TagAttachment, ChartTagAttachment };

/** POST /tags 요청 바디(생성 — 같은 이름이면 기존 태그 반환). */
export interface CreateTagInput {
    name: string;
}

/** PATCH /tags/:id 요청 바디(이름 변경). */
export interface RenameTagInput {
    name: string;
}

/** POST /tags/:id/attachments 요청 바디(부착 대상 타점 자연키). */
export interface AttachTagInput {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
    time: string; // HH:MM:SS 분봉 시각
}

/** POST /tags/:id/chart-attachments 요청 바디(부착 대상 차트). */
export interface AttachChartTagInput {
    stockCode: string;
    date: string; // YYYY-MM-DD 거래일
}
