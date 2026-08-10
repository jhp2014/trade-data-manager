// 유사도 맵 큐레이션 CRUD 클라이언트. wire 타입(MapCorpus·MapPlacement…)은 contracts/wire 공유.
// 읽기는 말뭉치 하나(캐시 키 하나 → 화면 간 어긋남 불가 + 형제 자리 찾기가 공짜).
// 쓰기는 자리 조작이 전부 배열 — 다중선택·무리째 드래그가 낱개 요청으로 쪼개지면 부분 실패가 생긴다.
//
// ⚠ **좌표 이동은 invalidate 하지 않는다**: 좌표는 클라가 저자라 서버가 되돌려줄 게 없고, 드래그를 놓을
// 때마다 말뭉치를 다시 받으면 화면이 튄다. 낙관 갱신만 하고, 구조 변경(맵·자리 생성/삭제)만 invalidate 한다.
import type { MapCorpus, MapPlacement, MapPlacementMove, MapScope, NewMapPlacement, SimilarityMap, CandidateDay } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiDelete } from "./http.js";

export type { MapCorpus, SimilarityMap, MapScope, MapGroup, MapItemRef, MapPlacement, NewMapPlacement, MapPlacementMove, CandidateDay } from "@trade-data-manager/wire";

/** 맵·무리·자리 한 벌. 맵 단건 조회는 없다(소비자가 전부를 본다). */
export const fetchMapCorpus = (signal?: AbortSignal): Promise<MapCorpus> => apiGet<MapCorpus>("maps", undefined, signal);

/** 후보 하루 — 분석의 모수. 미배치 트레이 = 이것 − 그 맵의 자리(뺄셈은 화면이 한다). */
export const fetchCandidateDays = (signal?: AbortSignal): Promise<CandidateDay[]> =>
    apiGet<CandidateDay[]>("candidate-days", undefined, signal);

export const createMap = (name: string, scope: MapScope): Promise<SimilarityMap> => apiPost<SimilarityMap>("maps", { name, scope });

export const renameMap = (id: string, name: string): Promise<void> => apiPatch(`maps/${id}`, { name });

/** 맵 삭제 — 무리·자리도 함께 사라진다. 확인은 호출부가 띄운다. */
export const deleteMap = (id: string): Promise<void> => apiDelete(`maps/${id}`);

/** 자리 추가 — 응답은 **입력 순서**라 낙관 갱신의 임시 id 와 짝지을 수 있다. */
export const addPlacements = (mapId: string, placements: NewMapPlacement[]): Promise<MapPlacement[]> =>
    apiPost<MapPlacement[]>(`maps/${mapId}/placements`, { placements });

/** 좌표 이동(여럿 한 번). 응답 없음 — 위 주석대로 invalidate 하지 않는다. */
export const movePlacements = (mapId: string, moves: MapPlacementMove[]): Promise<void> =>
    apiPatch(`maps/${mapId}/placements`, { moves });

/** 자리 제거 — 항목이 아니라 그 자리들(다른 무리의 형제 자리는 남는다). */
export const removePlacements = (mapId: string, ids: string[]): Promise<void> =>
    apiDelete(`maps/${mapId}/placements`, undefined, { ids });
