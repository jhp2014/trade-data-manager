// [배선 B: 분봉 수집 지휘]  ← MarketDataCollectService(composer)  → DailyScanRepository · MinuteSweep · MinuteCandleStore
// [from,to] 안에 일봉이 있는 거래일만 순회하며 날짜별 MinuteSweep 에 위임한다.
// 전제: 일봉(A)이 먼저 끝나 있음. "일봉 존재 = 그날 거래일"이라 휴장·미수집일은 목록에서 자연 제외
// (거래일 달력·throw 불필요). collect()는 [today,today], backfill 은 구간 range 를 넘긴다.
import type { DateRange } from "#domain";
import type { DailyScanRepository, MinuteCandleStore } from "#port/collect";
import type { MinuteSweepService } from "./minuteSweepService.js";

export interface MinuteCollectResult {
    /** 분봉을 (부분 재개 포함) 수집한 거래일 수. */
    tradingDays: number;
    /** 완료로 판정해 건너뛴 날 수(기대집합 전부 저장됨 or 후보 0, overwrite=false). */
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
    minuteRepo: MinuteCandleStore;
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
            // B-② 재개정책.
            let sweepCodes: readonly string[] | undefined;
            if (options.overwrite) {
                // 그 날 분봉 비우고 전체 후보 재수집(sweep 가 codes 없이 후보 계산).
                await minuteRepo.deleteMinuteCandlesOnDate(date);
            } else {
                // 완료 판정 = 기대집합(일봉 재계산 후보) ⊆ 저장집합. 빠진 종목만 재수집 → 부분 실패 자가치유.
                // (예전엔 "1건이라도 있으면 skip"이라 부분 상태가 영구 누락으로 굳었다.)
                const expected = await minuteSweep.candidatesForDate(date);
                if (expected.length === 0) {
                    skippedDays++; // 후보 없는 날(데이터 없음/전부 프루닝) = 수집할 것 없음.
                    continue;
                }
                const stored = new Set(await minuteRepo.getMinuteStockCodesOnDate(date));
                const missing = expected.filter((code) => !stored.has(code));
                if (missing.length === 0) {
                    skippedDays++; // 기대집합 전부 저장됨 = 완료.
                    continue;
                }
                sweepCodes = missing;
            }
            // B-③ 분봉 fetch/save (재개면 빠진 종목만, overwrite/신규면 전체 후보).
            const r = await minuteSweep.sweepMinutesForDate(date, {
                codes: sweepCodes,
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
