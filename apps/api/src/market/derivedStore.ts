// DerivedStore — 당일 파생값 단일 창구. 두 보드 다 여기로 자기 것만 요청한다:
//  · replayBoard(date) → DayReplay(MinuteDerived[])   … 파일에서 그대로
//  · themeBoard(date)  → DayTheme(ThemeStats[])        … 같은 파일에서 재계산(분봉 재조회 0)
// 파생 캐시는 **파일 하나**뿐(불변). 최초 요청이 raw(분봉+원주가일봉)를 1회 fetch → deriveMinutes → 파일 저장.
// 동시 요청(복기+테마 같은 cold 날짜)은 날짜별 in-flight Promise 로 하나의 build 를 공유 → 중복 fetch 0.
// 테마 bucketCounts 는 파일 파생값에서 요청 때 재계산 → 카운팅 정책 바꿔도 파일 재빌드 없이 다음 요청에 반영.
import { mapWithConcurrency, subtractMonths } from "@trade-data-manager/market";
import type { MinuteCandle, DailyCandle } from "@trade-data-manager/market";
import { deriveMinutes, themeStatsOf, RAW_DAILY_LOOKBACK_MONTHS, type MinuteDerived, type DayReplay, type DayTheme } from "./dayReplay.js";
import { readReplay, writeReplay } from "./dayReplayCache.js";

/** 종목별 fetch 인플라이트 상한(분봉+원주가일봉). build 는 날짜당 1회라 넉넉히. */
const FETCH_CONCURRENCY = 8;

/** 필요한 메서드만 구조적으로 요구(포트 배럴 export 에 의존하지 않음). Drizzle repo 가 그대로 만족. */
export interface DerivedStoreDeps {
    universe: { stockCodesByDate(date: string): Promise<string[]> };
    minuteRepo: { getMinuteCandles(code: string, date: string): Promise<MinuteCandle[]> };
    rawDailyRepo: { getRawDailyCandles(code: string, range: { from: string; to: string }): Promise<DailyCandle[]> };
}

export class DerivedStore {
    private readonly inFlight = new Map<string, Promise<void>>();

    constructor(private readonly deps: DerivedStoreDeps) {}

    /** 복기보드 것 — 파일 파생값 그대로. */
    async replayBoard(date: string): Promise<DayReplay> {
        return this.ensureFile(date);
    }

    /** 테마보드 것 — 같은 파일에서 EOD(bucketCounts·trailingHighs) 재계산(분봉 재조회 0). */
    async themeBoard(date: string): Promise<DayTheme> {
        const replay = await this.ensureFile(date);
        return { date, stocks: replay.stocks.map((md) => themeStatsOf(md)) };
    }

    // 파일 read-through — warm 이면 즉시, cold 면 build(1회 fetch) 후 읽는다.
    private async ensureFile(date: string): Promise<DayReplay> {
        const hit = await readReplay(date);
        if (hit) return hit;
        await this.build(date);
        return (await readReplay(date)) ?? { date, stocks: [] };
    }

    // 날짜별 in-flight 공유 — 같은 cold 날짜로 복기+테마가 겹쳐도 fetch·build 는 한 번만.
    private build(date: string): Promise<void> {
        const existing = this.inFlight.get(date);
        if (existing) return existing;
        const p = this.doBuild(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        return p;
    }

    private async doBuild(date: string): Promise<void> {
        if (await readReplay(date)) return; // 다른 요청이 이미 구웠으면 skip

        const codes = await this.deps.universe.stockCodesByDate(date);
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };
        const reduced = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code) => {
            const [minutes, rawDaily] = await Promise.all([
                this.deps.minuteRepo.getMinuteCandles(code, date),
                this.deps.rawDailyRepo.getRawDailyCandles(code, range),
            ]);
            return deriveMinutes(code, minutes, rawDaily, date);
        });
        const stocks = reduced.filter((s): s is MinuteDerived => s !== null);
        await writeReplay({ date, stocks });
    }
}
