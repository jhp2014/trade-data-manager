// MarketCapRangeBackfillService — 전종목 날짜별 시총 백필(Command) 구현.
// 단일종목 MarketCapBackfiller 를 기간 내 거래된 전종목에 fan-out. 종목 실패는 격리(한 종목이 전체 안 막게).
// 대상 유니버스 = daily_candles 에 [from,to] 거래분이 있는 종목(실제 거래 종목만 — 폐지·무데이터 제외).
import type { DateRange } from "../../../domain/index.js";
import type { DailyScanRepository } from "../../port/outbound/index.js";
import type {
    MarketCapBackfiller,
    MarketCapRangeBackfiller,
    MarketCapRangeBackfillOptions,
    MarketCapRangeBackfillResult,
} from "../../port/inbound/index.js";
import { mapWithConcurrency } from "../../concurrency.js";

// 종목당 KIS(getListInfo)+키움(원주가)을 쓰므로 멀티키 천장을 채우려면 in-flight 종목 수를 키운다.
const DEFAULT_CONCURRENCY = 16;

export interface MarketCapRangeBackfillDeps {
    backfiller: MarketCapBackfiller;
    scanRepo: DailyScanRepository;
}

export class MarketCapRangeBackfillService implements MarketCapRangeBackfiller {
    constructor(private readonly deps: MarketCapRangeBackfillDeps) {}

    async backfillRange(
        range: DateRange,
        options: MarketCapRangeBackfillOptions = {},
    ): Promise<MarketCapRangeBackfillResult> {
        const { backfiller, scanRepo } = this.deps;
        const conc = options.concurrency ?? DEFAULT_CONCURRENCY;
        const codes = await scanRepo.listTradedStockCodes(range);

        const failed: string[] = [];
        let stored = 0;
        let done = 0;
        await mapWithConcurrency(codes, conc, async (code) => {
            try {
                const r = await backfiller.backfill(code, range);
                stored += r.stored;
            } catch {
                failed.push(code); // 종목 실패 격리
            } finally {
                options.onProgress?.({ done: ++done, total: codes.length });
            }
        });

        return { range, universe: codes.length, stored, failed };
    }
}
