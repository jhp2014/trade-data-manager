// 저장 가설 필터 CRUD 클라이언트. wire 타입(HypothesisFilter·HypothesisFilterExpr)은 contracts/wire 공유.
// 식(DNF)만 저장하고 outcome/type 패싯은 임시(저장 X). 평가·집계는 클라 인메모리(core domain).
import type { HypothesisFilter, HypothesisFilterExpr } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiDelete } from "./http.js";

export type { HypothesisFilter, HypothesisFilterExpr } from "@trade-data-manager/wire";

export const fetchHypothesisFilters = (signal?: AbortSignal): Promise<HypothesisFilter[]> =>
    apiGet<HypothesisFilter[]>("hypothesis-filters", undefined, signal);

/** 이름+식 저장(같은 이름이면 서버가 식 덮어쓰기). */
export const saveHypothesisFilter = (name: string, expr: HypothesisFilterExpr): Promise<HypothesisFilter> =>
    apiPost<HypothesisFilter>("hypothesis-filters", { name, expr });

export const deleteHypothesisFilter = (id: string): Promise<void> => apiDelete(`hypothesis-filters/${id}`);
