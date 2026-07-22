// 순위 배치 ↔ DB 행 매퍼. bigint id 는 무손실 string 계약(도메인)↔bigint(DB) 변환.
// PlacedPoint 는 slot⋈placement 조인 결과라 리포지토리에서 직접 매핑(단일 테이블 행 아님).
import type { RankAxis } from "@trade-data-manager/market";
import type { RankAxisRow } from "../schema/curation.js";

export function rowToRankAxis(r: RankAxisRow): RankAxis {
    return { id: String(r.id), name: r.name };
}
