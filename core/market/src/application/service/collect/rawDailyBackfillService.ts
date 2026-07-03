// 전종목 원주가(미수정) 일봉 백필 — 유니버스 코드를 제한 동시성으로 펼쳐 종목별 RawDailyIngestService 호출.
// 수정주가 DailySweepService 의 원주가 짝. 원주가는 불변이라 자가치유 없음(append-only) — 그냥 범위 수집.
import type { DateRange } from "#domain";
import type { StockMasterIngestService } from "./stockMasterIngestService.js";
import type { RawDailyIngestService } from "./rawDailyIngestService.js";
import { mapWithConcurrency } from "../../concurrency.js";

// 종목당 2콜(KRX+_AL) 동시 발사 → 키움 멀티키(키×5콜/초) 채우려면 in-flight 종목 수를 키운다. 풀이 자체 페이싱.
const DEFAULT_CONCURRENCY = 16;

export interface RawDailyBackfillResult {
    universe: number;
    /** 원주가 일봉 수집 성공 종목 수(실패 제외). */
    fetched: number;
    failed: { stockCode: string; error: string }[];
}

export interface RawDailyBackfillOptions {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
}

export interface RawDailyBackfillDeps {
    universe: StockMasterIngestService;
    rawIngest: RawDailyIngestService;
}

export class RawDailyBackfillService {
    constructor(private readonly deps: RawDailyBackfillDeps) {}

    async backfill(range: DateRange, options: RawDailyBackfillOptions = {}): Promise<RawDailyBackfillResult> {
        const { universe, rawIngest } = this.deps;
        const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

        // 유니버스(라이브) 갱신 + 대상 코드.
        const { stockCodes } = await universe.ingestStockMasters();

        const failed: RawDailyBackfillResult["failed"] = [];
        let done = 0;
        let fetched = 0;

        await mapWithConcurrency(stockCodes, concurrency, async (stockCode) => {
            try {
                await rawIngest.ingestRawDailyCandles(stockCode, range);
                fetched++;
            } catch (err) {
                // 종목 실패 격리 — 한 종목이 전체를 막지 않는다.
                failed.push({ stockCode, error: err instanceof Error ? err.message : String(err) });
            } finally {
                options.onProgress?.(++done, stockCodes.length);
            }
        });

        return { universe: stockCodes.length, fetched, failed };
    }
}
