import type { DailySnapshot } from "./daySummaryReader.js";

/**
 * 불변 meta 리더(inbound 포트) — 날짜 → 그날 universe 종목들의 스냅샷 스켈레톤(issues=[]).
 * 시트·master·시총·일봉·전일종가를 조인한 불변부만. issues(가변)는 소비측이 fresh 로 덮는다(applyIssues).
 * 메모리 캐시는 이 포트 위 어댑터(apps/api MetaStore)가 씌운다.
 */
export interface MetaReader {
    metaByDate(date: string): Promise<DailySnapshot[]>;
}
