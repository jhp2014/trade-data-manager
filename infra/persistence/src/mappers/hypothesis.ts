// 도메인 가설 ↔ DB 행 매퍼. bigint id 는 무손실 string 계약(도메인)↔bigint(DB) 변환.
import type { Hypothesis, HypothesisLink, HypothesisRelation } from "@trade-data-manager/market";
import type { HypothesisRow, HypothesisPointRow, HypothesisRelationRow } from "../schema/curation.js";

export function rowToHypothesis(r: HypothesisRow): Hypothesis {
    return { id: String(r.id), text: r.text };
}

export function rowToHypothesisLink(r: HypothesisPointRow): HypothesisLink {
    return { hypothesisId: String(r.hypothesisId), stockCode: r.stockCode, date: r.tradeDate, time: r.tradeTime };
}

export function rowToHypothesisRelation(r: HypothesisRelationRow): HypothesisRelation {
    return {
        id: String(r.id),
        fromId: String(r.fromId),
        toId: String(r.toId),
        relationType: r.relationType,
        note: r.note ?? undefined,
    };
}
