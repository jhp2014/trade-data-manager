// MarketDataCollector 구현 — 복기 수집의 공개 진입(Command). 세 단계를 조립하는 얇은 composer.
//   collectToday()   오늘. 일봉 최근2년 유지 → 오늘 분봉 → 당일 시총(ka10099 라이브). today() 하나로 앵커.
//   backfill(range)  과거 구간. 일봉 깊이 시딩([range.from−≈600봉, range.to]) → 구간 분봉 → 시총 백필(역산).
// 순서(일봉 → 분봉 → 시총)만 책임진다. 일봉이 먼저 끝나야 분봉이 "일봉 있는 거래일"을 보고,
// 시총 백필도 그때 채워진 raw 일봉 테이블(krx.close)을 읽는다. 실행 디테일은 각 collector·시총 유스케이스가 안다.
import type { DateRange } from "#domain";
import type {
    MarketDataCollector,
    CollectOptions,
    CollectResult,
    DailyMarketCapRecorder,
    MarketCapBackfiller,
} from "#port/inbound";
import type { DailyCollector } from "./dailyCollector.js";
import type { MinuteCollector } from "./minuteCollector.js";
import { seoulToday } from "../shared/dailyRange.js";

export interface MarketDataCollectDeps {
    dailyCollector: DailyCollector;
    minuteCollector: MinuteCollector;
    /** 당일 시총 입력(ka10099 라이브) — collectToday 가 부른다. */
    marketCapRecorder: DailyMarketCapRecorder;
    /** 날짜별 시총 백필(역산 + raw 테이블) — backfill 이 부른다. */
    marketCapBackfiller: MarketCapBackfiller;
    /** 오늘(YYYY-MM-DD) 공급자. 기본 = Asia/Seoul 현재일 — 주입 시 테스트 결정성↑. collectToday 의 유일한 앵커. */
    today?: () => string;
}

export class MarketDataCollectService implements MarketDataCollector {
    private readonly today: () => string;

    constructor(private readonly deps: MarketDataCollectDeps) {
        this.today = deps.today ?? seoulToday;
    }

    async collectToday(options: CollectOptions = {}): Promise<CollectResult> {
        const { dailyCollector, minuteCollector, marketCapRecorder } = this.deps;
        const today = this.today();
        // 일봉(최근2년 유지) → 분봉(오늘 하루) → 당일 시총(ka10099).
        const daily = await dailyCollector.refreshRecent(today, this.dailyOptions(options));
        const minute = await minuteCollector.collect({ from: today, to: today }, this.minuteOptions(options));
        const cap = await marketCapRecorder.record(today);
        return { range: { from: today, to: today }, ...daily, ...minute, marketCapStored: cap.stored };
    }

    async backfill(range: DateRange, options: CollectOptions = {}): Promise<CollectResult> {
        const { dailyCollector, minuteCollector, marketCapBackfiller } = this.deps;
        // 일봉(깊이 시딩) → 분봉(구간 전체) → 시총 백필(역산, 방금 채운 raw 테이블 읽음).
        const daily = await dailyCollector.backfillDepth(range, this.dailyOptions(options));
        const minute = await minuteCollector.collect(range, this.minuteOptions(options));
        const cap = await marketCapBackfiller.backfill(range, {
            concurrency: options.concurrency,
            onProgress: (p) => options.onProgress?.({ phase: "marketcap", done: p.done, total: p.total }),
        });
        return { range, ...daily, ...minute, marketCapStored: cap.stored };
    }

    private dailyOptions(options: CollectOptions) {
        return {
            overwrite: options.overwrite,
            concurrency: options.concurrency,
            onFetch: (done: number, total: number) => options.onProgress?.({ phase: "daily" as const, done, total }),
        };
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
