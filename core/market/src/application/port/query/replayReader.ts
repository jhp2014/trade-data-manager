import type { DayReplay } from "#domain";

/**
 * 복기 파생 리더(inbound driving 포트) — 날짜 → 그날 종목별 per-minute 파생(DayReplay).
 * 내부에서 outbound 포트(분봉·원주가일봉·universe)로 fetch 후 deriveMinutes. 파일 캐시는 이 포트 위 어댑터(apps/api)가 씌운다.
 */
export interface ReplayReader {
    dayReplay(date: string): Promise<DayReplay>;
}
