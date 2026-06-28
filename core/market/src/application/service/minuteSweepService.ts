// 복기 3단계 — 한 거래일 분봉 수집·선별 적재 유스케이스.
// fetch = 거래대금 탑400 ∪ 고가등락률 ≥15% (넓게, 놓침 방지)
// store = (분단위 누적거래대금 ever-탑100) ∪ (≥15% 게이너)  (좁게, 용량)
// pool 분봉은 휘발(메모리)로 받아 순위 계산에만 쓰고, 통과 종목만 영속화.
import {
    selectDailyCandidates,
    selectMinuteTop100Ever,
    computeChangeRate,
    type DailyRankInput,
    type MinuteCandle,
    type PoolStockMinutes,
} from "../../domain/index.js";
import type {
    DailyScanRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "../port/outbound/index.js";
import { buildDailyRankInputs } from "./dailyRankInputs.js";
import { mapWithConcurrency } from "../concurrency.js";

// 내부 협력자(MarketDataCollectService 가 조합). inbound 포트 아님 — 공개 표면은 collect 하나.
export interface MinuteSweepResult {
    date: string;
    poolSize: number;
    fetched: number;
    stored: number;
    failed: { stockCode: string; error: string }[];
}

export interface MinuteSweepOptions {
    poolLimit?: number;
    /** 저장 기준 = 분단위 누적거래대금 상위 몇 위(기본 100, 확정값). 테스트/튜닝 노브. */
    minuteTop?: number;
    /** 분봉 fetch 동시 실행 상한(기본 8). 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    onFetch?: (done: number, total: number, stockCode: string) => void;
}

// 확정 파라미터(사용자): fetch 거래대금 탑400, store 분단위 누적 탑100, 게이너 고가등락률 ≥15%.
const POOL_AMOUNT_RANK = 400;
const STORE_MINUTE_TOP = 100;
const GAINER_RATE_PERCENT = 15;
const NO_FLOOR = "999999999999999"; // pool 은 순위∪등락률만 — floor 비활성
const DEFAULT_CONCURRENCY = 8;

interface FetchOutcome {
    stockCode: string;
    candles: MinuteCandle[];
    error?: string;
}

export interface MinuteSweepDeps {
    scanRepo: DailyScanRepository;
    minuteProvider: MinuteCandleProvider;
    minuteRepo: MinuteCandleRepository;
}

function isGainer(i: DailyRankInput): boolean {
    const rate = computeChangeRate(i.high, i.prevClose);
    return rate !== null && Number(rate) >= GAINER_RATE_PERCENT;
}

export class MinuteSweepService {
    constructor(private readonly deps: MinuteSweepDeps) {}

    async sweepMinutesForDate(date: string, options: MinuteSweepOptions = {}): Promise<MinuteSweepResult> {
        const { scanRepo, minuteProvider, minuteRepo } = this.deps;
        const minuteTop = options.minuteTop ?? STORE_MINUTE_TOP;

        const inputs = await buildDailyRankInputs(scanRepo, date);
        if (inputs.length === 0) return { date, poolSize: 0, fetched: 0, stored: 0, failed: [] };

        // fetch pool = 거래대금 탑400 ∪ ≥15%
        let pool = selectDailyCandidates(inputs, {
            amountRankN: POOL_AMOUNT_RANK,
            highRateCutPercent: GAINER_RATE_PERCENT,
            amountFloorWon: NO_FLOOR,
        });
        if (options.poolLimit) pool = pool.slice(0, options.poolLimit);

        // 저장 필터 B: ≥15% 게이너(일봉 고가등락률) — pool 의 부분집합.
        const gainers = new Set(inputs.filter(isGainer).map((i) => i.stockCode));

        // pool 분봉 fetch(휘발) — 제한 동시성으로 유량 채움(풀이 rate limit 자체 페이싱). 종목 실패는 격리.
        const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
        let done = 0;
        const outcomes = await mapWithConcurrency(pool, concurrency, async (stockCode): Promise<FetchOutcome> => {
            try {
                const candles = await minuteProvider.getMinuteCandles(stockCode, date);
                return { stockCode, candles };
            } catch (err) {
                return { stockCode, candles: [], error: err instanceof Error ? err.message : String(err) };
            } finally {
                options.onFetch?.(++done, pool.length, stockCode);
            }
        });

        const poolData: PoolStockMinutes[] = [];
        const failed: MinuteSweepResult["failed"] = [];
        for (const o of outcomes) {
            if (o.error) failed.push({ stockCode: o.stockCode, error: o.error });
            else poolData.push({ stockCode: o.stockCode, candles: o.candles });
        }

        // 저장 필터 A: 분단위 누적거래대금 ever-탑100.
        const everTop = new Set(selectMinuteTop100Ever(poolData, minuteTop));

        // store = A ∪ B.
        let stored = 0;
        for (const { stockCode, candles } of poolData) {
            if (candles.length > 0 && (everTop.has(stockCode) || gainers.has(stockCode))) {
                await minuteRepo.saveMinuteCandles(candles);
                stored++;
            }
        }

        return { date, poolSize: pool.length, fetched: poolData.length, stored, failed };
    }
}
