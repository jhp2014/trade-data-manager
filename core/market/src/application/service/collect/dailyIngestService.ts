// 일봉 ingest 유스케이스 구현(수정주가·자가치유). 종목 1개 단위(전종목 스윕은 DailySweep 책임).
// 분봉 ingest 는 MinuteSweep 가 provider/repo 를 직접 다룬다 — 여긴 일봉 전용.
// 생성자 주입(수동 DI): provider·repository 는 포트 인터페이스만 안다.
import type { DailyBar, DailyCandle, DateRange } from "#domain";
import type { DailyCandleProvider, DailyCandleStore } from "#port/collect";
import { defaultDailyRange, seoulToday } from "../shared/dailyRange.js";

// 내부 협력자(종목 1개 단위 ingest). inbound 포트 아님 — 공개 표면은 collect.
export interface DailyIngestResult {
    stockCode: string;
    /** 소급조정(권리락/배당락/액면분할) 감지로 종목 전체를 재수집·덮어썼는가. */
    healed: boolean;
    saved: number;
}

export interface DailyIngestDeps {
    dailyProvider: DailyCandleProvider;
    dailyRepo: DailyCandleStore;
    /** 오늘(YYYY-MM-DD) 공급자. 기본 = Asia/Seoul 현재일. 받기 기준일(as-of — 키움 수정주가를 늘 오늘 기준으로)과 기본 범위 산정에 쓰임 — 주입 시 테스트 결정성↑. */
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

export class DailyIngestService {
    private readonly today: () => string;

    constructor(private readonly deps: DailyIngestDeps) {
        this.today = deps.today ?? seoulToday;
    }

    async ingestDailyCandles(stockCode: string, range?: DateRange): Promise<DailyIngestResult> {
        const asOf = this.today();
        const window = range ?? defaultDailyRange(asOf);
        const { dailyProvider, dailyRepo } = this.deps;

        // 키움 수정주가는 요청 to(=기준일) 시점까지의 이벤트만 반영한다(as-of). 과거 to 로 받으면 그 뒤 감자·액분이
        // 빠진 옛 기준 값이 섞이고, 자가치유가 그 값으로 전체를 덮는다(2026-07 사고). 그래서 받기는 항상 오늘
        // 기준일까지(현재 기준 한 벌), 저장만 요청 구간으로 자른다.
        const fetchTo = window.to > asOf ? window.to : asOf;
        const current = await dailyProvider.getDailyCandles(stockCode, { from: window.from, to: fetchTo });
        const fetched = current.filter((c) => c.date <= window.to);
        if (fetched.length === 0) {
            return { stockCode, healed: false, saved: 0 };
        }

        // 경계 비교: 받은 구간에서 DB 에도 있는 가장 과거 봉(겹침 지점) vs 같은 날 새 값.
        // 다르면 소급조정 발생 → 저장된 일봉 전체가 옛 기준이라 stale → 전체 재수집·덮어쓰기.
        // 받은 첫 날짜가 DB 에 없어도(정지일·저장분보다 과거로 넓힌 백필) 다음 겹침 날짜로 비교한다.
        // 새 값은 잘라내기 전 current 에서 찾는다 — 저장 구간 뒤에만 겹치는 백필도 비교가 선다.
        // (그 날짜가 새 시리즈에 없으면 — DB 엔 있는데 키움이 빼는 날 — 비교 없이 지나간다. 드묾, 다음 수집에서 재시도.)
        const stored = await dailyRepo.getEarliestDailyCandle(stockCode, fetched[0].date);
        const fresh = stored ? current.find((c) => c.date === stored.date) : undefined;
        if (stored && fresh && !candleUnchanged(fresh, stored)) {
            const bounds = await dailyRepo.getDailyDateBounds(stockCode);
            const from = bounds && bounds.earliest < window.from ? bounds.earliest : window.from;
            // 저장분 전체가 옛 기준이라 요청 구간 뒤에 이미 있던 행(~latest)도 함께 덮는다. 단 구간 뒤에 **새 날짜는
            // 만들지 않는다** — 오늘 봉 하나만 생겨도 전역 커버리지(getLatestDailyDate)가 다음 일상 수집의 sweep 을 통째 건너뛴다.
            const saveTo = bounds && bounds.latest > window.to ? bounds.latest : window.to;
            const full = (await dailyProvider.getDailyCandles(stockCode, { from, to: fetchTo })).filter((c) => c.date <= saveTo);
            await dailyRepo.saveDailyCandles(full);
            return { stockCode, healed: true, saved: full.length };
        }

        await dailyRepo.saveDailyCandles(fetched);
        return { stockCode, healed: false, saved: fetched.length };
    }
}
