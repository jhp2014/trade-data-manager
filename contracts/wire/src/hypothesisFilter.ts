// /hypothesis-filters 계약 — 저장된 가설 필터. expr(DNF)은 core 재노출, 저장본이라 id·createdAt 필수로 좁힌다.
import type { HypothesisFilterExpr } from "@trade-data-manager/market";

export type { HypothesisFilterExpr };

/** 저장된 가설 필터 1건(저장됨 → id·createdAt 필수). */
export interface HypothesisFilter {
    id: string;
    name: string;
    expr: HypothesisFilterExpr;
    createdAt: string; // ISO
}
