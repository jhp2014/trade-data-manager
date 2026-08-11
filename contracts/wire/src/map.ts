// /maps 계약 — 유사도 맵(평면). 도메인 값타입은 core/market 를 **재노출**(단일 출처).
//
// 평면 자체만 오간다. 그 위의 점(=그룹)과 좌표는 /groups 가 낸다 — 그룹 하나는 평면 하나에 살고,
// 좌표·부모를 그룹이 직접 들기 때문이다(옛 map_groups·map_placements 는 드롭).
import type { SimilarityMap, MapScope } from "@trade-data-manager/market";

export type { SimilarityMap, MapScope };

/** POST /maps 요청 바디. scope 는 만든 뒤 못 바꾼다 — 올릴 수 있는 그룹의 층위가 곧 평면의 정체다. */
export interface CreateMapInput {
    name: string;
    scope: MapScope;
}

/** PATCH /maps/:id 요청 바디(이름 변경). */
export interface RenameMapInput {
    name: string;
}
