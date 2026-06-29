// Inbound(driving) 포트 — 전종목 날짜별 시총 백필(일회성 Command, 쓰기).
// 단일종목 MarketCapBackfiller 를 기간 내 거래된 전종목에 fan-out(종목 실패 격리).
// 당일 입력(DailyMarketCapRecorder, ka10099 라이브)과 달리 이쪽은 과거 임의 구간을 재구성한다.
import type { DateRange } from "../../../../domain/index.js";

export interface MarketCapRangeBackfillProgress {
    done: number;
    total: number;
}

export interface MarketCapRangeBackfillOptions {
    /** fan-out 동시 실행 상한. 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    /** 진행 콜백 — 딜리버리(CLI)가 렌더. */
    onProgress?: (p: MarketCapRangeBackfillProgress) => void;
}

export interface MarketCapRangeBackfillResult {
    range: DateRange;
    /** 대상 종목 수(기간 내 거래된 전종목). */
    universe: number;
    /** 저장한 시총 행 합. */
    stored: number;
    /** 실패한 종목 코드. */
    failed: string[];
}

export interface MarketCapRangeBackfiller {
    backfillRange(
        range: DateRange,
        options?: MarketCapRangeBackfillOptions,
    ): Promise<MarketCapRangeBackfillResult>;
}
