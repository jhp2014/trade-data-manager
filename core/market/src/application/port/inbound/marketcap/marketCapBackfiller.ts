// Inbound(driving) 포트 — 전종목 날짜별 시총 백필(일회성 Command, 쓰기).
// 공개 표면은 이 전종목 백필 하나. 단일종목 백필은 내부 협력자(StockMarketCapBackfillService)다.
// 당일 입력(DailyMarketCapRecorder, ka10099 라이브)과 달리 이쪽은 과거 임의 구간을 KIS 역산으로 재구성한다.
import type { DateRange } from "../../../../domain/index.js";

export interface MarketCapBackfillProgress {
    done: number;
    total: number;
}

export interface MarketCapBackfillOptions {
    /** fan-out 동시 실행 상한. 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    /** 진행 콜백 — 딜리버리(CLI)가 렌더. */
    onProgress?: (p: MarketCapBackfillProgress) => void;
}

export interface MarketCapBackfillResult {
    range: DateRange;
    /** 대상 종목 수(기간 내 거래된 전종목). */
    universe: number;
    /** 저장한 시총 행 합. */
    stored: number;
    /** 실패한 종목 코드. */
    failed: string[];
}

export interface MarketCapBackfiller {
    /** 기간 내 거래된 전종목의 날짜별 시총을 백필(종목 실패 격리). */
    backfill(range: DateRange, options?: MarketCapBackfillOptions): Promise<MarketCapBackfillResult>;
}
