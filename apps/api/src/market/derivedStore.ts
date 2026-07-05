// DerivedStore — 당일 파생값 단일 창구. 두 보드 다 여기로 파생값을 요청한다:
//  · replay(date) → DayReplay(MinuteDerived[])  … 파일 캐시가 소유
//  · theme(date)  → DayTheme(ThemeStats[])       … 메모리 캐시가 소유
// 핵심: 어느 보드로 요청이 들어오든, 최초 요청이 raw(분봉+원주가일봉)를 **1회** fetch해서 없는 캐시를 굽는다.
// 동시 요청(복기+테마 같은 cold 날짜)은 날짜별 in-flight Promise 로 하나의 build 를 공유 → 중복 fetch 0.
// 스토어는 값의 3번째 사본을 안 가진다(파사드) — 저장·수명은 각 캐시가 소유(파일=영구, 메모리=거래일 LRU).
import { mapWithConcurrency, subtractMonths } from "@trade-data-manager/market";
import type { MinuteCandle, DailyCandle } from "@trade-data-manager/market";
import {
    deriveMinutes,
    buildThemeStats,
    RAW_DAILY_LOOKBACK_MONTHS,
    type MinuteDerived,
    type ThemeStats,
    type DayReplay,
    type DayTheme,
} from "./dayReplay.js";
import { readReplay, writeReplay } from "./dayReplayCache.js";
import { getTheme, setTheme } from "./themeStatsCache.js";

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

    /** 복기 파생 — 파일 warm 이면 즉시, 아니면 build(둘 다 cold면 테마까지 함께 굽는다). */
    async replay(date: string): Promise<DayReplay> {
        const hit = await readReplay(date);
        if (hit) return hit;
        await this.ensure(date);
        return (await readReplay(date)) ?? { date, stocks: [] };
    }

    /** 테마 파생 — 메모리 warm 이면 즉시, 아니면 build(둘 다 cold면 복기까지 함께 굽는다). */
    async theme(date: string): Promise<DayTheme> {
        const hit = getTheme(date);
        if (hit) return hit;
        await this.ensure(date);
        return getTheme(date) ?? { date, stocks: [] };
    }

    // 날짜별 in-flight 공유 — 같은 cold 날짜로 요청이 겹쳐도 build 는 한 번만.
    private ensure(date: string): Promise<void> {
        const existing = this.inFlight.get(date);
        if (existing) return existing;
        const p = this.build(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        return p;
    }

    // raw 1회 fetch → 없는 캐시만 굽는다. 둘 다 있으면 fetch 자체를 건너뛴다.
    private async build(date: string): Promise<void> {
        const fileHit = await readReplay(date);
        const memHit = getTheme(date);
        if (fileHit && memHit) return;

        const codes = await this.deps.universe.stockCodesByDate(date);
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };
        const rows = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code) => {
            const [minutes, rawDaily] = await Promise.all([
                this.deps.minuteRepo.getMinuteCandles(code, date),
                this.deps.rawDailyRepo.getRawDailyCandles(code, range),
            ]);
            return { code, minutes, rawDaily };
        });

        if (!memHit) {
            const stocks = rows
                .map((r) => buildThemeStats(r.code, r.minutes, r.rawDaily, date))
                .filter((s): s is ThemeStats => s !== null);
            setTheme(date, { date, stocks }); // in-memory(무실패) 먼저
        }
        if (!fileHit) {
            const stocks = rows
                .map((r) => deriveMinutes(r.code, r.minutes, r.rawDaily, date))
                .filter((s): s is MinuteDerived => s !== null);
            await writeReplay({ date, stocks });
        }
    }
}
