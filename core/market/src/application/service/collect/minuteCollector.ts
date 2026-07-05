// [배선 B: 분봉 수집 지휘]  ← MarketDataCollectService(composer)  → DailyScanRepository · MinuteSweep · MinuteCandleRepository
// [from,to] 안에 일봉이 있는 거래일만 순회하며 날짜별 MinuteSweep 에 위임한다.
// 전제: 일봉(A)이 먼저 끝나 있음. "일봉 존재 = 그날 거래일"이라 휴장·미수집일은 목록에서 자연 제외
// (거래일 달력·throw 불필요). collect()는 [today,today], backfill 은 구간 range 를 넘긴다.
import type { DateRange } from "#domain";
import type { DailyScanRepository, MinuteCandleRepository } from "#port/outbound";
import type { MinuteSweepService } from "./minuteSweepService.js";

export interface MinuteCollectResult {
    /** 분봉을 수집한(데이터 있던) 거래일 수. */
    tradingDays: number;
    /** 이미 수집돼 건너뛴 날 수(overwrite=false). */
    skippedDays: number;
    /** 저장한 (종목·일) 합. */
    totalStored: number;
}

export interface MinuteCollectOptions {
    overwrite?: boolean;
    poolLimit?: number;
    concurrency?: number;
    onFetch?: (date: string, done: number, total: number) => void;
}

export interface MinuteCollectorDeps {
    scanRepo: DailyScanRepository;
    minuteSweep: MinuteSweepService;
    minuteRepo: MinuteCandleRepository;
}

export class MinuteCollector {
    constructor(private readonly deps: MinuteCollectorDeps) {}

    async collect(range: DateRange, options: MinuteCollectOptions = {}): Promise<MinuteCollectResult> {
        const { scanRepo, minuteSweep, minuteRepo } = this.deps;
        // B-① 대상 = 이 범위에 일봉이 있는 거래일만.
        const dates = await scanRepo.listTradedDates(range);

        let tradingDays = 0;
        let skippedDays = 0;
        let totalStored = 0;
        for (const date of dates) {
            // B-② 재개정책: overwrite 면 그 날 분봉 비우고, 아니면 이미 있으면 skip.
            if (options.overwrite) {
                await minuteRepo.deleteMinuteCandlesOnDate(date);
            } else if (await minuteRepo.hasMinuteCandlesOnDate(date)) {
                skippedDays++;
                continue;
            }
            // B-③ 프루닝(일봉 ≥200억 ∪ ≥10%) → 분봉 fetch/save.
            const r = await minuteSweep.sweepMinutesForDate(date, {
                poolLimit: options.poolLimit,
                concurrency: options.concurrency,
                onFetch: (done, total) => options.onFetch?.(date, done, total),
            });
            tradingDays++;
            totalStored += r.stored;
        }
        return { tradingDays, skippedDays, totalStored };
    }
}
