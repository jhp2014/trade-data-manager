// [배선 A: 일봉 수집 지휘]  ← MarketDataCollectService(composer)  → StockMasterIngest · DailySweep · DailyScanRepository
// 유니버스 갱신 + 커버리지 정책을 소유하고 fan-out 은 DailySweep 에 위임한다.
//   · overwrite=false: 최신 저장 거래일이 range.to 까지 왔으면 sweep 생략(skip-if-present, 재개 안전).
//   · overwrite=true : 항상 sweep(강제 재수집·덮어쓰기). 과거 구간 시딩은 이 경로.
// 수집 깊이 = [range.from−24개월, range.to](차트 표시 깊이 런웨이). DailySweep 가 종목당 수정주가+원주가를 함께 수집.
import type { DateRange } from "#domain";
import type { DailyScanRepository } from "#port/collect";
import type { StockMasterIngestService } from "./stockMasterIngestService.js";
import type { DailySweepService } from "./dailySweepService.js";
import { backfillDailyRange } from "../shared/dailyRange.js";

export interface DailyCollectResult {
    universeCount: number;
    /** 일봉을 (재)수집했는가. overwrite=false 는 커버리지에 따라 false 가능, overwrite=true 는 항상 true. */
    dailyRefreshed: boolean;
}

export interface DailyCollectOptions {
    overwrite?: boolean;
    concurrency?: number;
    onFetch?: (done: number, total: number) => void;
}

export interface DailyCollectorDeps {
    universe: StockMasterIngestService;
    dailySweep: DailySweepService;
    scanRepo: DailyScanRepository;
}

export class DailyCollector {
    constructor(private readonly deps: DailyCollectorDeps) {}

    async collect(range: DateRange, options: DailyCollectOptions = {}): Promise<DailyCollectResult> {
        const { universe, dailySweep, scanRepo } = this.deps;
        // A-① 유니버스 라이브 갱신(ka10099) → stock_master + fresh 코드.
        const { stockCodes } = await universe.ingestStockMasters();

        // A-② 커버리지: overwrite 면 무조건, 아니면 최신 저장 거래일 < range.to 일 때만 (재)수집.
        let refreshed: boolean;
        if (options.overwrite === true) {
            refreshed = true;
        } else {
            const latest = await scanRepo.getLatestDailyDate();
            refreshed = latest === null || latest < range.to;
        }

        if (refreshed) {
            // A-③ [fanout] 종목당 수정주가+원주가 (range.from−24개월 런웨이), 실패 격리.
            await dailySweep.sweepDailyForUniverse(stockCodes, {
                range: backfillDailyRange(range),
                concurrency: options.concurrency,
                onFetch: (done, total) => options.onFetch?.(done, total),
            });
        }
        return { universeCount: stockCodes.length, dailyRefreshed: refreshed };
    }
}
