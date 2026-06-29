// MarketDataCollector 구현 — 복기 수집의 단일 진입 유스케이스(Command).
// 내부 협력자(유니버스·단일종목 일봉 ingest·분봉 sweep)를 조합한다. 딜리버리(CLI/UI)는 collect 하나만 안다.
//
// 흐름: ① 유니버스 갱신 → ② 일봉 커버리지 확인(못 미치거나 overwrite 면 전종목 일봉 수집)
//       → ③ [from,to] 각 거래일 분봉 선별 스윕(이미 있으면 overwrite=false 시 건너뜀).
// 일봉=wholesale(전종목·범위무관 커버리지), 분봉=날짜별 — 의 비대칭을 여기서 흡수.
import type { DateRange } from "../../domain/index.js";
import type { DailyScanRepository, MinuteCandleRepository } from "../port/outbound/index.js";
import type { MarketDataCollector, CollectOptions, CollectResult } from "../port/inbound/index.js";
import { mapWithConcurrency } from "../concurrency.js";
import { enumerateDates } from "./dates.js";
import type { StockMasterIngestService } from "./stockMasterIngestService.js";
import type { MarketDataIngestService } from "./marketDataIngestService.js";
import type { MinuteSweepService } from "./minuteSweepService.js";

// 종목당 2콜(KRX+_AL)을 동시 발사하므로, 키움 멀티키(키×5콜/초)를 채우려면 in-flight 종목 수를 키운다.
// 풀이 rate limit 을 자체 페이싱하므로 과다 설정해도 큐잉만 될 뿐 안전. 3~4키 기준 16.
const DEFAULT_CONCURRENCY = 16;

export interface MarketDataCollectDeps {
    universe: StockMasterIngestService;
    dailyIngest: MarketDataIngestService;
    minuteSweep: MinuteSweepService;
    scanRepo: DailyScanRepository;
    minuteRepo: MinuteCandleRepository;
}

export class MarketDataCollectService implements MarketDataCollector {
    constructor(private readonly deps: MarketDataCollectDeps) {}

    async collect(range: DateRange, options: CollectOptions = {}): Promise<CollectResult> {
        const { overwrite = false, concurrency, poolLimit, onProgress } = options;
        const conc = concurrency ?? DEFAULT_CONCURRENCY;
        const { universe, dailyIngest, minuteSweep, scanRepo, minuteRepo } = this.deps;

        // ① 유니버스(라이브) — 스윕 대상 fresh 코드 + stock_master 갱신.
        onProgress?.({ phase: "universe" });
        const { stockCodes } = await universe.ingestStockMasters();

        // ② 일봉 커버리지: range.to 에 못 미치거나 overwrite 면 전종목 일봉 (재)수집.
        const latest = await scanRepo.getLatestDailyDate();
        const dailyRefreshed = overwrite || latest === null || latest < range.to;
        if (dailyRefreshed) {
            let done = 0;
            await mapWithConcurrency(stockCodes, conc, async (stockCode) => {
                try {
                    await dailyIngest.ingestDailyCandles(stockCode);
                } catch {
                    // 종목 실패 격리 — 한 종목이 전체를 막지 않는다.
                } finally {
                    onProgress?.({ phase: "daily", done: ++done, total: stockCodes.length });
                }
            });
        }

        // ③ 날짜별 분봉 선별 스윕.
        let tradingDays = 0;
        let skippedDays = 0;
        let totalStored = 0;
        for (const date of enumerateDates(range.from, range.to)) {
            if (overwrite) {
                // 비우고 새로 — 이전 수집에만 있던 종목(orphan) 제거.
                await minuteRepo.deleteMinuteCandlesOnDate(date);
            } else if (await minuteRepo.hasMinuteCandlesOnDate(date)) {
                skippedDays++;
                continue;
            }
            const r = await minuteSweep.sweepMinutesForDate(date, {
                poolLimit,
                concurrency: conc,
                onFetch: (d, t) => onProgress?.({ phase: "minute", date, done: d, total: t }),
            });
            if (r.poolSize === 0) continue; // 비거래일·일봉 없음
            tradingDays++;
            totalStored += r.stored;
        }

        return {
            range,
            universeCount: stockCodes.length,
            dailyRefreshed,
            tradingDays,
            skippedDays,
            totalStored,
        };
    }
}
