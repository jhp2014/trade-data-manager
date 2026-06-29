// Inbound(driving) 포트 — 복기 데이터 수집 단일 유스케이스(Command, 쓰기).
// 당일/과거/범위/월 전부 collect(range) 하나로. 내부에서 유니버스·일봉커버리지·날짜별 분봉을 조합한다.
import type { DateRange } from "../../../../domain/index.js";

export interface CollectProgress {
    phase: "universe" | "daily" | "minute";
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
    /** 일봉을 (재)수집했는가. 커버리지가 충분하면 false. */
    dailyRefreshed: boolean;
    /** 분봉을 수집한(데이터 있던) 거래일 수. */
    tradingDays: number;
    /** 이미 수집돼 건너뛴 날 수(overwrite=false). */
    skippedDays: number;
    /** 저장한 (종목·일) 합. */
    totalStored: number;
}

export interface MarketDataCollector {
    /** [from,to] 복기 데이터 수집. 비거래일은 자연 스킵. */
    collect(range: DateRange, options?: CollectOptions): Promise<CollectResult>;
}
