// /maps 계약 — 유사도 맵 큐레이션. 도메인 값타입은 core/market 를 **재노출**(단일 출처).
// 파생도 읽기모델도 아니라 저장한 것 그대로다 — skeleton 처럼 전용 와이어 타입을 만들 이유가 없다(rank 선례).
//
// 읽기는 `GET /maps` **하나**로 말뭉치 전체(맵·무리·자리). 왕복 1회·캐시 1개면 화면 간 어긋남이 불가능하고
// 형제 자리 찾기(징검다리 호버)가 공짜다 — 근거는 domain/map/similarityMap.ts 의 MapCorpus.
//
// 쓰기는 **자리 조작이 전부 배열**이다. 다중선택·무리째 드래그가 1급이라 낱개 요청으로 쪼개면 부분 실패가
// 생긴다(removeMany 를 allSettled 로 수습했던 전례). 좌표는 클라가 저자라 이동 응답은 본문이 없다 —
// 화면은 낙관 갱신만 하고 invalidate 하지 않는다(구조 변경만 invalidate).
import type { SimilarityMap, MapScope, MapGroup, MapItemRef, MapPlacement, MapCorpus, NewMapPlacement, MapPlacementMove } from "@trade-data-manager/market";

export type { SimilarityMap, MapScope, MapGroup, MapItemRef, MapPlacement, MapCorpus, NewMapPlacement, MapPlacementMove };

/** POST /maps 요청 바디(생성). scope 는 만든 뒤 못 바꾼다 — 점의 정체가 곧 맵의 정체다. */
export interface CreateMapInput {
    name: string;
    scope: MapScope;
}

/** PATCH /maps/:id 요청 바디(이름 변경). */
export interface RenameMapInput {
    name: string;
}

/** POST /maps/:id/placements 요청 바디 — 여럿 한 번에(트레이에서 다중 드롭). */
export interface AddPlacementsInput {
    placements: NewMapPlacement[];
}

/** PATCH /maps/:id/placements 요청 바디 — 이동도 여럿 한 번에. */
export interface MovePlacementsInput {
    moves: MapPlacementMove[];
}

/** DELETE /maps/:id/placements 요청 바디 — 자리 id 목록(항목이 아니라 자리를 지운다). */
export interface RemovePlacementsInput {
    ids: string[];
}
