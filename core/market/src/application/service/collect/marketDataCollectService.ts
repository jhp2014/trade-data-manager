// MarketDataCollector 구현 — 복기 수집의 공개 진입(Command). 두 유스케이스를 조립하는 얇은 composer.
//   collectToday()   오늘. 일봉 최근2년 유지 → 오늘 분봉. range 인자 없이 today() 하나로 앵커.
//   backfill(range)  과거 구간. 일봉 깊이 시딩([range.from−≈600봉, range.to]) → 구간 분봉.
// 순서(일봉 → 분봉)만 책임진다. 유니버스·커버리지·깊이·프루닝 같은 실행 디테일은
// DailyCollector·MinuteCollector 가 안다. 일봉이 먼저 끝나야 분봉이 "일봉 있는 거래일"을 볼 수 있다.
import type { DateRange } from "#domain";
import type { MarketDataCollector, CollectOptions, CollectResult } from "#port/inbound";
import type { DailyCollector } from "./dailyCollector.js";
import type { MinuteCollector } from "./minuteCollector.js";
import { seoulToday } from "../shared/dailyRange.js";

export interface MarketDataCollectDeps {
    dailyCollector: DailyCollector;
    minuteCollector: MinuteCollector;
    /** 오늘(YYYY-MM-DD) 공급자. 기본 = Asia/Seoul 현재일 — 주입 시 테스트 결정성↑. collect() 의 유일한 앵커. */
    today?: () => string;
}

export class MarketDataCollectService implements MarketDataCollector {
    private readonly today: () => string;

    constructor(private readonly deps: MarketDataCollectDeps) {
        this.today = deps.today ?? seoulToday;
    }

    async collectToday(options: CollectOptions = {}): Promise<CollectResult> {
        const { dailyCollector, minuteCollector } = this.deps;
        const today = this.today();
        // 일봉(최근2년 유지) → 분봉(오늘 하루).
        const daily = await dailyCollector.refreshRecent(today, {
            overwrite: options.overwrite,
            concurrency: options.concurrency,
            onFetch: (done, total) => options.onProgress?.({ phase: "daily", done, total }),
        });
        const minute = await minuteCollector.collect(
            { from: today, to: today },
            this.minuteOptions(options),
        );
        return { range: { from: today, to: today }, ...daily, ...minute };
    }

    async backfill(range: DateRange, options: CollectOptions = {}): Promise<CollectResult> {
        const { dailyCollector, minuteCollector } = this.deps;
        // 일봉(깊이 시딩) → 분봉(구간 전체).
        const daily = await dailyCollector.backfillDepth(range, {
            overwrite: options.overwrite,
            concurrency: options.concurrency,
            onFetch: (done, total) => options.onProgress?.({ phase: "daily", done, total }),
        });
        const minute = await minuteCollector.collect(range, this.minuteOptions(options));
        return { range, ...daily, ...minute };
    }

    private minuteOptions(options: CollectOptions) {
        return {
            overwrite: options.overwrite,
            poolLimit: options.poolLimit,
            concurrency: options.concurrency,
            onFetch: (date: string, done: number, total: number) =>
                options.onProgress?.({ phase: "minute" as const, date, done, total }),
        };
    }
}
