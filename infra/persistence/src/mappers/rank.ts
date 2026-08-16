// 순위 배치 ↔ DB 행 매퍼.
// **id 는 계약을 못 건넌다** — 축은 이름이 곧 정체성이라 id 를 떨군다(저장소 안에는 그대로 남는다).
// PlacedPoint 는 slot⋈placement 조인 결과라 리포지토리에서 직접 매핑(단일 테이블 행 아님).
import type { RankAxis, RankAxisScope } from "@trade-data-manager/market";
import type { RankAxisRow } from "../schema/curation.js";

export function rowToRankAxis(r: RankAxisRow): RankAxis {
    return { name: r.name, scope: r.scope as RankAxisScope };
}
