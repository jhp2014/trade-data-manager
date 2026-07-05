// 전종목 일봉 (재)수집 — 유니버스 코드 리스트를 제한 동시성으로 펼쳐(fan-out) 종목별 ingest.
// 종목당 수정주가(자가치유)+원주가(append-only) 둘 다를 한 스윕에서 확보한다(원주가 흡수).
// 단일종목 ingest 는 DailyIngest(수정)·RawDailyIngest(원주가)가, 여기는 fan-out·실패격리·진행률만 책임.
// MinuteSweepService(한 날짜 분봉 펼침)의 일봉 짝.
import type { DateRange } from "#domain";
import type { DailyIngestService } from "./dailyIngestService.js";
import type { RawDailyIngestService } from "./rawDailyIngestService.js";
import { mapWithConcurrency } from "../../concurrency.js";

// 종목당 2콜(KRX+_AL)을 동시 발사하므로, 키움 멀티키(키×5콜/초)를 채우려면 in-flight 종목 수를 키운다.
// 풀이 rate limit 을 자체 페이싱하므로 과다 설정해도 큐잉만 될 뿐 안전. 3~4키 기준 16.
const DEFAULT_CONCURRENCY = 16;

export interface DailySweepResult {
    /** 펼친 유니버스 종목 수. */
    universeSize: number;
    /** 일봉 수집 성공 종목 수(실패 제외). */
    fetched: number;
    /** 소급조정(권리락/배당락/액면분할) 감지로 종목 전체를 재수집·덮어쓴 종목 수. */
    healed: number;
    failed: { stockCode: string; error: string }[];
}

export interface DailySweepOptions {
    /** 일봉 fetch 동시 실행 상한(기본 16). 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    /** 일봉 수집 범위(수정·원주가 공통). 없으면 각 leaf 기본. collect=최근2년 / backfill=런웨이 포함 range. */
    range?: DateRange;
    onFetch?: (done: number, total: number, stockCode: string) => void;
}

export interface DailySweepDeps {
    dailyIngest: DailyIngestService;
    rawDailyIngest: RawDailyIngestService;
}

export class DailySweepService {
    constructor(private readonly deps: DailySweepDeps) {}

    async sweepDailyForUniverse(
        stockCodes: readonly string[],
        options: DailySweepOptions = {},
    ): Promise<DailySweepResult> {
        const { dailyIngest, rawDailyIngest } = this.deps;
        const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
        const failed: DailySweepResult["failed"] = [];
        let done = 0;
        let fetched = 0;
        let healed = 0;

        await mapWithConcurrency(stockCodes, concurrency, async (stockCode) => {
            try {
                // 종목당 수정주가(자가치유)+원주가(append-only) 둘 다. 원주가는 소급조정 무관이라 독립.
                const [daily] = await Promise.all([
                    dailyIngest.ingestDailyCandles(stockCode, options.range),
                    rawDailyIngest.ingestRawDailyCandles(stockCode, options.range),
                ]);
                fetched++;
                if (daily.healed) healed++;
            } catch (err) {
                // 종목 실패 격리 — 한 종목이 전체를 막지 않는다.
                failed.push({ stockCode, error: err instanceof Error ? err.message : String(err) });
            } finally {
                options.onFetch?.(++done, stockCodes.length, stockCode);
            }
        });

        return { universeSize: stockCodes.length, fetched, healed, failed };
    }
}
