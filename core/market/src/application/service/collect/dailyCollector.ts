// [배선 A: 일봉 수집 지휘]  ← MarketDataCollectService(composer)  → StockMasterIngest · DailySweep · DailyScanRepository
// 유니버스 갱신 + 커버리지/깊이 정책을 소유하고 fan-out 은 DailySweep 에 위임한다.
//   · refreshRecent(collect용): 오늘 기준 최근 2년. 이미 오늘까지 커버돼 있고 overwrite 아니면 sweep 생략(재개 안전).
//   · backfillDepth(backfill용): range.from−≈600봉 런웨이까지 깊이 확보. 항상 sweep(과거 깊이는 latest 로 판단 못 함).
// 두 경로 모두 DailySweep 가 종목당 수정주가(자가치유)+원주가(append-only)를 함께 수집한다.
import type { DateRange } from "#domain";
import type { DailyScanRepository } from "#port/outbound";
import type { StockMasterIngestService } from "./stockMasterIngestService.js";
import type { DailySweepService } from "./dailySweepService.js";
import { collectDailyRange, backfillDailyRange } from "../shared/dailyRange.js";

export interface DailyCollectResult {
    universeCount: number;
    /** 일봉을 (재)수집했는가. refreshRecent 는 커버리지에 따라 false 가능, backfillDepth 는 항상 true. */
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

    /** collect: 오늘 기준 최근 2년 유지. 최신 저장 거래일이 오늘까지 왔고 overwrite 아니면 sweep 생략. */
    async refreshRecent(today: string, options: DailyCollectOptions = {}): Promise<DailyCollectResult> {
        const { universe, dailySweep, scanRepo } = this.deps;
        // A-① 유니버스 라이브 갱신(ka10099) → stock_master + fresh 코드.
        const { stockCodes } = await universe.ingestStockMasters();
        // A-② 커버리지 게이트: 최신 저장 거래일 < 오늘 이거나 overwrite 면 (재)수집.
        const range = collectDailyRange(today);
        const latest = await scanRepo.getLatestDailyDate();
        const refreshed = options.overwrite === true || latest === null || latest < range.to;
        if (refreshed) {
            // A-③ [fanout] 종목당 수정주가+원주가 (2년 깊이), 실패 격리.
            await dailySweep.sweepDailyForUniverse(stockCodes, {
                range,
                concurrency: options.concurrency,
                onFetch: (done, total) => options.onFetch?.(done, total),
            });
        }
        return { universeCount: stockCodes.length, dailyRefreshed: refreshed };
    }

    /** backfill: [range.from−≈600봉, range.to] 깊이 확보. 게이트 없이 항상 sweep(차트 런웨이 시딩). */
    async backfillDepth(range: DateRange, options: DailyCollectOptions = {}): Promise<DailyCollectResult> {
        const { universe, dailySweep } = this.deps;
        const { stockCodes } = await universe.ingestStockMasters();
        await dailySweep.sweepDailyForUniverse(stockCodes, {
            range: backfillDailyRange(range),
            concurrency: options.concurrency,
            onFetch: (done, total) => options.onFetch?.(done, total),
        });
        return { universeCount: stockCodes.length, dailyRefreshed: true };
    }
}
