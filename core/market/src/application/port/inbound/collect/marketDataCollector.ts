// Inbound(driving) 포트 — 복기 캔들(일봉+분봉) 수집 유스케이스(Command, 쓰기).
// 단일 진입: backfill(range). 일상 수집도 최근 넉넉한 range 로 backfill(overwrite=false, skip-if-present)하면 된다.
//   · 일봉 깊이는 range 인자가 아니라 [range.from−24개월, range.to] 로 파생(차트 런웨이).
//   · overwrite=false: 일봉 skip-if-present(latest≥range.to 면 생략) · 분봉 skip-if-present(날짜별). 과거 시딩은 overwrite=true.
// 시총·뉴스·공모가는 별도 유스케이스 — 딜리버리(CLI)가 함께 조립한다.
import type { DateRange } from "#domain";

export interface CollectProgress {
    phase: "daily" | "minute";
    /** minute 단계의 거래일(YYYY-MM-DD). */
    date?: string;
    done?: number;
    total?: number;
}

export interface CollectOptions {
    /** true = 일봉 강제 재수집 + 분봉 delete·refetch. false(기본) = 둘 다 skip-if-present(재개 안전). */
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
    /** 일봉을 (재)수집했는가. overwrite=false 면 커버리지에 따라 false. */
    dailyRefreshed: boolean;
    /** 분봉을 수집한(데이터 있던) 거래일 수. */
    tradingDays: number;
    /** 이미 수집돼 건너뛴 날 수(overwrite=false). */
    skippedDays: number;
    /** 저장한 (종목·일) 합. */
    totalStored: number;
}

export interface DailyBackfillResult {
    range: DateRange;
    universeCount: number;
    dailyRefreshed: boolean;
}

export interface MarketDataCollector {
    /** [from,to] 복기 캔들(일봉+분봉) 수집. 비거래일은 자연 스킵. 일상=최근 range+overwrite없음 / 과거 시딩=overwrite. */
    backfill(range: DateRange, options?: CollectOptions): Promise<CollectResult>;
    /** 일봉만 수집(분봉 없이) — 차트용 딥 히스토리 시딩. stockMaster 갱신 포함(유니버스 fetch 선행). */
    backfillDaily(range: DateRange, options?: CollectOptions): Promise<DailyBackfillResult>;
}
