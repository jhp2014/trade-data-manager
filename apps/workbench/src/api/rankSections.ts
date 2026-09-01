// 순위 단면 번들 조회 — GET /rank-sections. 서수 원료뿐이고(N/M 무지) 테마·임계값 파생은 전부 클라
// 읽기 시점(lib/useRankSections). 계약의 뜻은 wire rankSection.ts 머리 주석.
import type { RankSectionBundle } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { WireRankSection, RankSectionDate, RankSectionBundle } from "@trade-data-manager/wire";

export const fetchRankSections = (signal?: AbortSignal): Promise<RankSectionBundle> =>
    apiGet<RankSectionBundle>("rank-sections", undefined, signal);
