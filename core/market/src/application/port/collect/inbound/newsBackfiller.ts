import type { DateRange } from "#domain";

/** 진행 콜백 — 페이지마다 현재 앵커 날짜와 누적 헤드라인 수. */
export interface NewsBackfillProgress {
    pages: number;
    anchorDate: string; // 방금 받은 페이지의 가장 오래된 날짜(되감기 위치)
    headlines: number; // 누적 저장 헤드라인(행 펼침 전, 겹침 제거 후)
}

export interface NewsBackfillResult {
    range: DateRange;
    pages: number; // API 호출(페이지) 수
    headlines: number; // 저장한 헤드라인 수(겹침 제거 후)
}

export interface NewsBackfillOptions {
    onProgress?: (p: NewsBackfillProgress) => void;
}

/**
 * 뉴스 백필(일회성 Command) — 시황 피드를 [from, to] 만큼 연속 역방향 워크로 긁어 저장한다.
 * 실시간 전진 폴링과는 성격이 달라(장중 알림) 별도 컴포넌트이며, 이 포트는 과거 채움 전용이다.
 */
export interface NewsBackfiller {
    backfill(range: DateRange, opts?: NewsBackfillOptions): Promise<NewsBackfillResult>;
}
