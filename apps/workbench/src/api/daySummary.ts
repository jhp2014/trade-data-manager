// /day-summary 조회 클라이언트 — wire 타입은 contracts/wire 에서 서버와 단일 계약으로 공유(로컬 재정의 폐기).
// 실제 응답은 EnrichedDaySummary(스냅샷에 folding 필드 포함). 차트(분봉)·순위·필터는 클라 몫.
import type { EnrichedDaySummary } from "@trade-data-manager/wire";

export type { EnrichedDaySummary as DaySummary, EnrichedSnapshot as DailySnapshot, ThemeTag, IssueTag } from "@trade-data-manager/wire";

export async function fetchDaySummary(date: string): Promise<EnrichedDaySummary> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-summary?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-summary ${res.status}: ${body}`);
    }
    return res.json() as Promise<EnrichedDaySummary>;
}
