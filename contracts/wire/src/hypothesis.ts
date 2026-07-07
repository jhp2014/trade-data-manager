// /hypotheses 계약 — 가설 큐레이션. 링크(정션)는 core 재노출, 가설·관계는 와이어에서 **id 필수**로 좁힌다.
// (저장된 것만 와이어를 타므로 id 는 항상 존재 — 클라가 id? 옵셔널을 다루지 않게. api 가 경계에서 정규화.)
import type { HypothesisLink } from "@trade-data-manager/market";

export type { HypothesisLink };

/** 매매 가설 1건(저장됨 → id 필수). */
export interface Hypothesis {
    id: string;
    text: string;
}

/** 가설 그래프 엣지(저장됨 → id 필수). relationType 느슨(better_than | parent_of | …). */
export interface HypothesisRelation {
    id: string;
    fromId: string;
    toId: string;
    relationType: string;
    note?: string;
}
