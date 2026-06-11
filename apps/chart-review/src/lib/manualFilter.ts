import type { ReviewPoint } from "@/types/review";
import { splitManualValue } from "@/lib/manualValue";

/** 활성 필터(값이 1개 이상 선택된 키) 개수. */
export function activeFilterCount(filters: Record<string, string[]>): number {
  return Object.values(filters).filter((values) => values.length > 0).length;
}

/**
 * 타점이 m_ 필터에 매칭되는지 검사.
 * - 값이 선택된 키만 조건으로 본다(키 간 AND).
 * - 같은 키 안에서는 선택 값 중 하나라도 타점 값에 포함되면 통과(OR).
 * - 필터가 비어 있으면 항상 true.
 */
export function pointMatchesManualFilters(
  point: ReviewPoint,
  filters: Record<string, string[]>,
): boolean {
  return payloadMatchesManualFilters(point.sourceRow.manual, filters);
}

/**
 * payload(또는 manual 맵)가 m_ 필터에 매칭되는지 검사.
 * 값은 string("a | b") 또는 string[] 모두 허용한다. (서버 Export 공용)
 */
export function payloadMatchesManualFilters(
  payload: Record<string, string | string[]>,
  filters: Record<string, string[]>,
): boolean {
  for (const [key, allowed] of Object.entries(filters)) {
    if (allowed.length === 0) continue;
    const raw = payload[key];
    const values = Array.isArray(raw) ? raw.map((v) => v.trim()).filter(Boolean) : splitManualValue(raw);
    if (!allowed.some((value) => values.includes(value))) return false;
  }
  return true;
}
