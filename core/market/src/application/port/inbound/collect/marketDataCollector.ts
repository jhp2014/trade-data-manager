// Inbound(driving) 포트 — 복기 데이터 수집 유스케이스(Command, 쓰기).
// 두 진입점: collect()=최신 거래일(오늘) / backfill(range)=과거 구간 재구성.
//   · 일봉 깊이는 range 인자가 아니라 진입점이 정한다(collect=오늘−2년 / backfill=range.from−≈600봉).
//   · 분봉은 collect=오늘 하루 / backfill=구간 전체(일봉 있는 거래일만).
import type { DateRange } from "#domain";

export interface CollectProgress {
    phase: "daily" | "minute";
    /** minute 단계의 거래일(YYYY-MM-DD). */
    date?: string;
    done?: number;
    total?: number;
}

export interface CollectOptions {
    /** 이미 분봉이 수집된 날도 재수집(재fetch·덮어쓰기)하고 일봉도 강제 재수집. 기본 false = 건너뜀(재개 안전). */
    overwrite?: boolean;
    /** fetch 동시 실행 상한(일봉·분봉 공통). 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    /** 분봉 pool 상한(스모크용). */
    poolLimit?: number;
    /** 진행 콜백 — 딜리버리(CLI/UI)가 렌더. core 는 콘솔을 모른다. */
    onProgress?: (event: CollectProgress) => void;
}

export interface CollectResult {
    range: DateRange;
    universeCount: number;
    /** 일봉을 (재)수집했는가. 커버리지가 충분하면 false(collect 만; backfill 은 항상 true). */
    dailyRefreshed: boolean;
    /** 분봉을 수집한(데이터 있던) 거래일 수. */
    tradingDays: number;
    /** 이미 수집돼 건너뛴 날 수(overwrite=false). */
    skippedDays: number;
    /** 저장한 (종목·일) 합. */
    totalStored: number;
}

export interface MarketDataCollector {
    /** 최신 거래일(오늘) 수집 — 일봉 최근 2년 유지 + 오늘 분봉. range 없음(today() 앵커). */
    collect(options?: CollectOptions): Promise<CollectResult>;
    /** [from,to] 과거 구간 복기 재구성 — 일봉 깊이 시딩 + 구간 분봉. 비거래일은 자연 스킵. */
    backfill(range: DateRange, options?: CollectOptions): Promise<CollectResult>;
}
