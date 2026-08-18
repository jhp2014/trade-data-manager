// 후보 하루 — 분석의 모수(유니버스). 흔적(앵커·골격·타점·그룹…)이 하나라도 있는 (종목·날짜).
import type { CandidateDay } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { CandidateDay } from "@trade-data-manager/wire";

export const fetchCandidateDays = (signal?: AbortSignal): Promise<CandidateDay[]> =>
    apiGet<CandidateDay[]>("candidate-days", undefined, signal);
