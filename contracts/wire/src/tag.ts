// /tags 계약 — 타점 태그(명목형 분류). 도메인 값타입(Tag·TagAttachment)은 core/market 를 **재노출**(단일 출처).
// 부착은 review-points 계약과 분리한다: 태그 토글이 타점 목록 캐시를 흔들지 않고, 사전·부착만 따로 무효화된다.
import type { Tag, TagAttachment } from "@trade-data-manager/market";

export type { Tag, TagAttachment };

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
