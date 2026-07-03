// 원주가(미수정) 일봉 수집 유스케이스 — 종목 1개 단위. 수정주가 ingest(MarketDataIngestService)의 원주가 짝.
// 결정적 차이: 원주가는 사후 불변이라 **자가치유(소급조정 감지→덮어쓰기)가 없다**. 그냥 수집해서 append-only 저장
// (repo 가 onConflictDoNothing — 이미 있는 (종목,날)은 유지). 백필/증분 둘 다 이 한 메서드로.
import type { DateRange } from "#domain";
import type { RawDailyCandleProvider, RawDailyCandleRepository } from "#port/outbound";
import { defaultDailyRange, seoulToday } from "../shared/dailyRange.js";

export interface RawDailyIngestResult {
    stockCode: string;
    saved: number;
}

export interface RawDailyIngestDeps {
    rawProvider: RawDailyCandleProvider;
    rawRepo: RawDailyCandleRepository;
    /** 오늘(YYYY-MM-DD) 공급자. 기본 = Asia/Seoul 현재일(기본 범위 산정용). 주입 시 테스트 결정성↑. */
    today?: () => string;
}

export class RawDailyIngestService {
    private readonly today: () => string;

    constructor(private readonly deps: RawDailyIngestDeps) {
        this.today = deps.today ?? seoulToday;
    }

    /**
     * 종목의 원주가 일봉을 [range] 수집·저장. range 미지정 시 기본 창(defaultDailyRange).
     * append-only — 이미 저장된 날은 유지(불변). 반환 saved = 이번에 수집한 봉 수(중복 포함, 실제 삽입 수 아님).
     */
    async ingestRawDailyCandles(stockCode: string, range?: DateRange): Promise<RawDailyIngestResult> {
        const window = range ?? defaultDailyRange(this.today());
        const candles = await this.deps.rawProvider.getRawDailyCandles(stockCode, window);
        await this.deps.rawRepo.saveRawDailyCandles(candles);
        return { stockCode, saved: candles.length };
    }
}
