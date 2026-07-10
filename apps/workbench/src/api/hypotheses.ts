// 가설 큐레이션 CRUD 클라이언트. wire 타입(Hypothesis·HypothesisLink·HypothesisRelation)은 contracts/wire 공유.
// 세 목록(가설·링크·관계)을 받아 패널이 인메모리로 조립·필터. 가설↔타점 연결은 자연키(code·date·time) = review point 삼중키.
import type { Hypothesis, HypothesisLink, HypothesisRelation } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiDelete } from "./http.js";

export type { Hypothesis, HypothesisLink, HypothesisRelation } from "@trade-data-manager/wire";

export const fetchHypotheses = (signal?: AbortSignal): Promise<Hypothesis[]> => apiGet<Hypothesis[]>("hypotheses", undefined, signal);

export const fetchHypothesisLinks = (signal?: AbortSignal): Promise<HypothesisLink[]> => apiGet<HypothesisLink[]>("hypotheses/links", undefined, signal);

export const createHypothesis = (text: string): Promise<Hypothesis> => apiPost<Hypothesis>("hypotheses", { text });

export const updateHypothesis = (id: string, text: string): Promise<void> => apiPatch(`hypotheses/${id}`, { text });

export const linkHypothesis = (link: HypothesisLink): Promise<void> => apiPost<void>("hypotheses/links", link);

export const unlinkHypothesis = (link: HypothesisLink): Promise<void> =>
    apiDelete("hypotheses/links", { hypothesisId: link.hypothesisId, code: link.stockCode, date: link.date, time: link.time });

export const deleteHypothesis = (id: string): Promise<void> => apiDelete(`hypotheses/${id}`);

export const fetchHypothesisRelations = (signal?: AbortSignal): Promise<HypothesisRelation[]> =>
    apiGet<HypothesisRelation[]>("hypotheses/relations", undefined, signal);

export const addRelation = (r: { fromId: string; toId: string; relationType: string; note?: string }): Promise<HypothesisRelation> =>
    apiPost<HypothesisRelation>("hypotheses/relations", r);

export const removeRelation = (id: string): Promise<void> => apiDelete(`hypotheses/relations/${id}`);
