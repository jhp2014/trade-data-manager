// 저장 가설 필터 ↔ DB 행 매퍼. bigint id 는 무손실 string, jsonb expr 은 HypothesisFilterExpr 로 캐스팅.
import type { HypothesisFilter, HypothesisFilterExpr } from "@trade-data-manager/market";
import type { HypothesisFilterRow } from "../schema/curation.js";

export function rowToHypothesisFilter(r: HypothesisFilterRow): HypothesisFilter {
    return {
        id: String(r.id),
        name: r.name,
        expr: r.expr as HypothesisFilterExpr,
        createdAt: r.createdAt.toISOString(),
    };
}
