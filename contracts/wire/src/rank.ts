// /rank-axes 계약 — 순위 배치 큐레이션. 도메인 값타입(RankAxis·PlacedPoint)은 core/market 를 **재노출**(단일 출처).
//
// **축은 이름으로, 자리는 타점으로 지목한다.** id 는 계약을 건너지 않는다(로컬 미러와 Supabase 가 각자
// 발급 → 동기화를 건넌 참조가 다른 행을 가리킨다). slot 은 애초에 이름이 없고 order_key 는 reindex 가
// 다시 쓰는 값이라, 자리를 가리키는 유일하게 안정된 손잡이가 "그 자리에 있는 타점"이다.
// 이름·타점 모두 바디로 보낸다 — 축 이름은 자유 텍스트라 경로에 실으면 인코딩 사고가 난다.
import type { RankAxis, AxisLine, PlacedPoint, RankPoint, RankTarget } from "@trade-data-manager/market";

export type { RankAxis, AxisLine, PlacedPoint, RankPoint, RankTarget };

/** POST /rank-axes 요청 바디. scope 생략 시 point(타점별). */
export interface CreateAxisInput {
    name: string;
    scope?: string; // "point"(기본) | "day"
}

/** PATCH /rank-axes/rename 요청 바디. */
export interface RenameAxisInput {
    name: string;
    newName: string;
}

/** POST /rank-axes/remove 요청 바디 — slot·placement 까지 cascade 로 사라진다. */
export interface RemoveAxisInput {
    name: string;
}

/** POST /rank-axes/placements 요청 바디 — 이 타점을 이 축의 어느 자리에. */
export interface PlaceInput {
    axis: string;
    point: RankPoint;
    target: RankTarget;
}

/** POST /rank-axes/placements/remove 요청 바디. day 축은 그날 전 타점이 함께 빠진다. */
export interface UnplaceInput {
    axis: string;
    point: RankPoint;
}
