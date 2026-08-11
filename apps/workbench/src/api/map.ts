// 유사도 맵 클라이언트 — **평면 자체만**. 그 위의 점(=그룹)과 좌표는 api/groups.ts 가 낸다.
// 그룹 하나는 평면 하나에 살고 좌표·부모를 직접 들기 때문에 배치 엔드포인트가 여기 없다.
import type { SimilarityMap, MapScope, CandidateDay } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiDelete } from "./http.js";

export type { SimilarityMap, MapScope, CandidateDay } from "@trade-data-manager/wire";

export const fetchMaps = (signal?: AbortSignal): Promise<SimilarityMap[]> => apiGet<SimilarityMap[]>("maps", undefined, signal);

/** 후보 하루 — 분석의 모수. 맵과 무관하게 변하므로(앵커 하나만 찍어도 는다) 별도 키로 둔다. */
export const fetchCandidateDays = (signal?: AbortSignal): Promise<CandidateDay[]> =>
    apiGet<CandidateDay[]>("candidate-days", undefined, signal);

export const createMap = (name: string, scope: MapScope): Promise<SimilarityMap> => apiPost<SimilarityMap>("maps", { name, scope });

export const renameMap = (id: string, name: string): Promise<void> => apiPatch(`maps/${id}`, { name });

/** 삭제 — 그 평면의 그룹은 지워지지 않고 **내려온다**(좌표·부모가 풀린다). 확인은 호출부가 띄운다. */
export const deleteMap = (id: string): Promise<void> => apiDelete(`maps/${id}`);
