import type { DateRange, MissingStatFill } from "#domain";

export interface DailyStatCollectOptions {
    /** 날짜 동시 처리 수(기본은 구현체 상수). 소스가 날짜당 2콜이라 과하게 올릴 이유가 없다. */
    concurrency?: number;
    onProgress?: (p: { done: number; total: number; date: string }) => void;
}

/** 일별 속성 수집 결과(날짜 fan-out). */
export interface DailyStatCollectResult {
    range: DateRange;
    /** 실제로 돈 거래일 수. */
    dates: number;
    /** 저장한 행 수. */
    stored: number;
    /** 실패한 거래일(날짜 실패는 격리 — 하루가 전체를 막지 않는다). */
    failed: string[];
    /** 소스 누락분 메우기 결과. 둘 다 0 이 정상. */
    gaps: MissingStatFill;
}

/**
 * 일별 종목 속성(시총·상장주식수·소속부) 수집 — **백필과 당일 수집이 같은 진입점**이다.
 * 소스가 날짜 낟알이라 "어제 하루"나 "15개월"이나 같은 코드고, 범위 길이만 다르다.
 */
export interface DailyStatCollector {
    collect(range: DateRange, options?: DailyStatCollectOptions): Promise<DailyStatCollectResult>;
}
