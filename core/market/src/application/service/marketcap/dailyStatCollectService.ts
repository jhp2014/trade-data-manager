// DailyStatCollectService — 일별 종목 속성(시총·상장주식수·소속부) 수집(inbound 포트 DailyStatCollector 구현).
// 흐름: ① 거래일 목록(일봉 존재 = 그날 거래일)  ② 날짜별 전종목 1회 조회  ③ upsert.
// 옛 시총 백필(종목 fan-out + 발행주식수 역산)의 대체 — 소스가 날짜 낟알이라 종목 루프가 통째로 사라진다.
// 날짜 실패는 격리한다(하루가 전체를 막지 않게). 휴장일은 소스가 빈 배열을 주므로 자연히 0행이 된다.
import type { DateRange } from "#domain";
import type { DailyScanRepository, DailyStockStatsProvider, DailyStockStatStore } from "#port/collect";
import type { DailyStatCollector, DailyStatCollectOptions, DailyStatCollectResult } from "#port/collect";
import { mapWithConcurrency } from "../../concurrency.js";

/** 날짜 동시 처리 수. 날짜당 소스 2콜(유가증권·코스닥)이라 4면 초당 부하가 충분히 낮다. */
const DEFAULT_CONCURRENCY = 4;

export interface DailyStatCollectDeps {
    source: DailyStockStatsProvider;
    scanRepo: DailyScanRepository;
    repo: DailyStockStatStore;
}

export class DailyStatCollectService implements DailyStatCollector {
    constructor(private readonly deps: DailyStatCollectDeps) {}

    async collect(
        range: DateRange,
        options: DailyStatCollectOptions = {},
    ): Promise<DailyStatCollectResult> {
        const { source, scanRepo, repo } = this.deps;
        const conc = options.concurrency ?? DEFAULT_CONCURRENCY;
        const dates = await scanRepo.listTradedDates(range);

        const failed: string[] = [];
        let stored = 0;
        let done = 0;
        await mapWithConcurrency(dates, conc, async (date) => {
            try {
                const rows = await source.getDailyStats(date);
                await repo.saveDailyStats(rows);
                stored += rows.length;
            } catch {
                failed.push(date); // 날짜 실패 격리
            } finally {
                options.onProgress?.({ done: ++done, total: dates.length, date });
            }
        });

        // 후처리 — 소스가 안 준 거래분 메우기. 채우는 건 "그 종목의 마지막 날"뿐이고(주식수 불변 보장),
        // 중간 구멍은 세기만 한다. 둘 다 0 이 정상이라 0 이 아니면 결과에 실려 눈에 띈다.
        const gaps = await repo.fillMissingTradedDays(range);

        return { range, dates: dates.length, stored, failed, gaps };
    }
}
