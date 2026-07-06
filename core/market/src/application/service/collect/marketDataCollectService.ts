// MarketDataCollector 구현 — 복기 수집(일봉+분봉)의 공개 진입(Command). 얇은 composer.
//   backfill(range, {overwrite})  일봉 깊이 시딩([range.from−24개월, range.to]) → 구간 분봉.
// 순서(일봉 → 분봉)만 책임진다: 일봉이 먼저 끝나야 분봉이 "일봉 있는 거래일"을 본다.
// 시총·뉴스·공모가는 별도 유스케이스 — 무엇을 같이 돌릴지는 딜리버리(CLI)가 조립한다(여긴 캔들만).
import type { DateRange } from "#domain";
import type {
    MarketDataCollector,
    CollectOptions,
    CollectResult,
    DailyBackfillResult,
} from "#port/collect";
import type { DailyCollector } from "./dailyCollector.js";
import type { MinuteCollector } from "./minuteCollector.js";

export interface MarketDataCollectDeps {
    dailyCollector: DailyCollector;
    minuteCollector: MinuteCollector;
}

export class MarketDataCollectService implements MarketDataCollector {
    constructor(private readonly deps: MarketDataCollectDeps) {}

    async backfill(range: DateRange, options: CollectOptions = {}): Promise<CollectResult> {
        const { dailyCollector, minuteCollector } = this.deps;
        // 일봉(깊이 시딩) → 분봉(구간 전체, 일봉 있는 거래일만).
        const daily = await dailyCollector.collect(range, {
            overwrite: options.overwrite,
            concurrency: options.concurrency,
            onFetch: (done, total) => options.onProgress?.({ phase: "daily", done, total }),
        });
        const minute = await minuteCollector.collect(range, {
            overwrite: options.overwrite,
            poolLimit: options.poolLimit,
            concurrency: options.concurrency,
            onFetch: (date, done, total) => options.onProgress?.({ phase: "minute", date, done, total }),
        });
        return { range, ...daily, ...minute };
    }

    async backfillDaily(range: DateRange, options: CollectOptions = {}): Promise<DailyBackfillResult> {
        // 일봉만(분봉 없이) — 차트용 딥 히스토리 시딩. stockMaster 갱신은 DailyCollector 내부에서 선행.
        const daily = await this.deps.dailyCollector.collect(range, {
            overwrite: options.overwrite,
            concurrency: options.concurrency,
            onFetch: (done, total) => options.onProgress?.({ phase: "daily", done, total }),
        });
        return { range, ...daily };
    }
}
