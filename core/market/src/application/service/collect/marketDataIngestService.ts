// 복기 ingest 유스케이스 구현. 종목 1개 단위(전종목 스윕은 앱/크론 책임).
// 생성자 주입(수동 DI): provider·repository 는 포트 인터페이스만 안다.
import type { DailyBar, DailyCandle, DateRange } from "../../../domain/index.js";
import type {
    DailyCandleProvider,
    DailyCandleRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "../../port/outbound/index.js";
import { defaultDailyRange, seoulToday } from "../shared/dailyRange.js";

// 내부 협력자(종목 1개 단위 ingest). inbound 포트 아님 — 공개 표면은 collect.
export interface DailyIngestResult {
    stockCode: string;
    /** 소급조정(권리락/배당락/액면분할) 감지로 종목 전체를 재수집·덮어썼는가. */
    healed: boolean;
    saved: number;
}

export interface MinuteIngestResult {
    stockCode: string;
    date: string;
    saved: number;
}

export interface MarketDataIngestDeps {
    dailyProvider: DailyCandleProvider;
    minuteProvider: MinuteCandleProvider;
    dailyRepo: DailyCandleRepository;
    minuteRepo: MinuteCandleRepository;
    /** 오늘(YYYY-MM-DD) 공급자. 기본 = Asia/Seoul 현재일. 기본 일봉 범위(1.5년) 산정에만 쓰임 — 주입 시 테스트 결정성↑. */
    today?: () => string;
}

const eqInt = (a: string, b: string): boolean => BigInt(a) === BigInt(b);

/** 자가치유 트리거 비교 = KRX·UN 의 OHLCV(거래대금 제외). 소급조정 시 가격·거래량이 바뀐다. */
function ohlcvEqual(a: DailyBar, b: DailyBar): boolean {
    return (
        eqInt(a.open, b.open) &&
        eqInt(a.high, b.high) &&
        eqInt(a.low, b.low) &&
        eqInt(a.close, b.close) &&
        eqInt(a.volume, b.volume)
    );
}

function candleUnchanged(fresh: DailyCandle, stored: DailyCandle): boolean {
    return ohlcvEqual(fresh.krx, stored.krx) && ohlcvEqual(fresh.un, stored.un);
}

export class MarketDataIngestService {
    private readonly today: () => string;

    constructor(private readonly deps: MarketDataIngestDeps) {
        this.today = deps.today ?? seoulToday;
    }

    async ingestDailyCandles(stockCode: string, range?: DateRange): Promise<DailyIngestResult> {
        const window = range ?? defaultDailyRange(this.today());
        const { dailyProvider, dailyRepo } = this.deps;

        const fetched = await dailyProvider.getDailyCandles(stockCode, window);
        if (fetched.length === 0) {
            return { stockCode, healed: false, saved: 0 };
        }

        // 경계 비교: 가장 과거 수집봉(겹침 지점) vs DB 동일 날짜.
        // 다르면 소급조정 발생 → 저장된 일봉 전체가 옛 기준이라 stale → 전체 재수집·덮어쓰기.
        const oldest = fetched[0];
        const stored = await dailyRepo.getDailyCandle(stockCode, oldest.date);
        if (stored && !candleUnchanged(oldest, stored)) {
            const earliest = await dailyRepo.getEarliestDailyDate(stockCode);
            const from = earliest && earliest < window.from ? earliest : window.from;
            const full = await dailyProvider.getDailyCandles(stockCode, { from, to: window.to });
            await dailyRepo.saveDailyCandles(full);
            return { stockCode, healed: true, saved: full.length };
        }

        await dailyRepo.saveDailyCandles(fetched);
        return { stockCode, healed: false, saved: fetched.length };
    }

    async ingestMinuteCandles(stockCode: string, date: string): Promise<MinuteIngestResult> {
        const candles = await this.deps.minuteProvider.getMinuteCandles(stockCode, date);
        await this.deps.minuteRepo.saveMinuteCandles(candles);
        return { stockCode, date, saved: candles.length };
    }
}
