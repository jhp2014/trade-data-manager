// /day-summary 조회 클라이언트 — wire 타입은 contracts/wire 공유. 실제 응답은 EnrichedDaySummary(folding 필드 포함).
import type { EnrichedDaySummary } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { EnrichedDaySummary as DaySummary, EnrichedSnapshot as DailySnapshot, ThemeTag } from "@trade-data-manager/wire";

export const fetchDaySummary = (date: string, signal?: AbortSignal): Promise<EnrichedDaySummary> => apiGet<EnrichedDaySummary>("day-summary", { date }, signal);
