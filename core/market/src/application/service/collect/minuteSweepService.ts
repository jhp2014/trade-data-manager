// 한 거래일 분봉 수집 — 저장 대상 = 일봉 거래대금 ≥200억 ∪ 고가등락률 ≥10% (넓게).
// 분단위 순위로 더 좁히지 않는다(최적화 대신 넓게 저장 + DB 용량은 파티셔닝으로 해결).
// 받은 종목은 그대로 저장(빈 분봉 제외). 종목 fetch 실패는 격리.
import { selectDailyCandidates } from "../../../domain/index.js";
import type {
    DailyScanRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "../../port/outbound/index.js";
import { buildDailyRankInputs } from "./dailyRankInputs.js";
import { mapWithConcurrency } from "../../concurrency.js";

// 확정 파라미터(사용자 2026-06-29): 저장 = 일봉 거래대금 ≥200억 ∪ 고가등락률 ≥10%.
// 순위(rank) 컷 미사용 — 절대 거래대금 floor 기준이라 저장량이 그날 시장 활기에 비례한다.
const STORE_AMOUNT_FLOOR_WON = "20000000000"; // 200억
const GAINER_RATE_PERCENT = 10;
const NO_RANK = 0; // amountRankN=0 → 순위 keep 비활성(floor∪등락률만)
const DEFAULT_CONCURRENCY = 8;

export interface MinuteSweepResult {
    date: string;
    /** 저장 대상(≥200억 ∪ ≥10%) 종목 수. */
    poolSize: number;
    /** 분봉 받은 종목 수(실패 제외). */
    fetched: number;
    /** 실제 저장한 종목 수(빈 분봉 제외). */
    stored: number;
    failed: { stockCode: string; error: string }[];
}

export interface MinuteSweepOptions {
    poolLimit?: number;
    /** 분봉 fetch 동시 실행 상한(기본 8). 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    onFetch?: (done: number, total: number, stockCode: string) => void;
}

export interface MinuteSweepDeps {
    scanRepo: DailyScanRepository;
    minuteProvider: MinuteCandleProvider;
    minuteRepo: MinuteCandleRepository;
}

export class MinuteSweepService {
    constructor(private readonly deps: MinuteSweepDeps) {}

    async sweepMinutesForDate(date: string, options: MinuteSweepOptions = {}): Promise<MinuteSweepResult> {
        const { scanRepo, minuteProvider, minuteRepo } = this.deps;

        const inputs = await buildDailyRankInputs(scanRepo, date);
        if (inputs.length === 0) return { date, poolSize: 0, fetched: 0, stored: 0, failed: [] };

        // 저장 대상 = 거래대금 ≥200억 ∪ 고가등락률 ≥10% (일봉 기준, 넓게).
        let pool = selectDailyCandidates(inputs, {
            amountRankN: NO_RANK,
            highRateCutPercent: GAINER_RATE_PERCENT,
            amountFloorWon: STORE_AMOUNT_FLOOR_WON,
        });
        if (options.poolLimit) pool = pool.slice(0, options.poolLimit);

        const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
        const failed: MinuteSweepResult["failed"] = [];
        let done = 0;
        let fetched = 0;
        let stored = 0;

        // fetch 즉시 저장(휘발 누적 없음). 풀이 rate limit 페이싱.
        await mapWithConcurrency(pool, concurrency, async (stockCode) => {
            try {
                const candles = await minuteProvider.getMinuteCandles(stockCode, date);
                fetched++;
                if (candles.length > 0) {
                    await minuteRepo.saveMinuteCandles(candles);
                    stored++;
                }
            } catch (err) {
                failed.push({ stockCode, error: err instanceof Error ? err.message : String(err) });
            } finally {
                options.onFetch?.(++done, pool.length, stockCode);
            }
        });

        return { date, poolSize: pool.length, fetched, stored, failed };
    }
}
