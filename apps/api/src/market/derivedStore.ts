// DerivedStore — ReplayReader(core inbound 포트) 위에 씌운 **파일 캐시 어댑터**. 두 보드가 여기로 자기 것만 요청:
//  · replayBoard(date) → DayReplay(MinuteDerived[])   … 파일 캐시(없으면 ReplayReader.dayReplay 로 build)
//  · themeBoard(date)  → DayTheme(ThemeStats[])        … 같은 파일에서 themeStatsOf(순수) 재계산(분봉 재조회 0)
// fetch·derive 오케스트레이션은 core ReplayReadService 가 하고, 이 store 는 캐시만 소유(헥사고날: 앱이 inbound 포트 의존).
// 동시 요청(복기+테마 같은 cold 날짜)은 날짜별 in-flight Promise 로 하나의 build 를 공유 → 중복 fetch 0.
import { themeStatsOf, type ReplayReader, type DayReplay, type DayTheme } from "@trade-data-manager/market";
import { readReplay, writeReplay } from "./dayReplayCache.js";

export class DerivedStore {
    private readonly inFlight = new Map<string, Promise<void>>();

    constructor(private readonly replay: ReplayReader) {}

    /** 복기보드 것 — 파일 파생값 그대로. */
    async replayBoard(date: string): Promise<DayReplay> {
        return this.ensureFile(date);
    }

    /** 테마보드 것 — 같은 파일에서 EOD(bucketCounts·trailingHighs) 재계산(분봉 재조회 0). */
    async themeBoard(date: string): Promise<DayTheme> {
        const replay = await this.ensureFile(date);
        return { date, stocks: replay.stocks.map((md) => themeStatsOf(md)) };
    }

    // 파일 read-through — warm 이면 즉시, cold 면 ReplayReader 로 build(1회 fetch) 후 읽는다.
    private async ensureFile(date: string): Promise<DayReplay> {
        const hit = await readReplay(date);
        if (hit) return hit;
        await this.build(date);
        return (await readReplay(date)) ?? { date, stocks: [] };
    }

    // 날짜별 in-flight 공유 — 같은 cold 날짜로 복기+테마가 겹쳐도 build 는 한 번만.
    private build(date: string): Promise<void> {
        const existing = this.inFlight.get(date);
        if (existing) return existing;
        const p = this.doBuild(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        return p;
    }

    private async doBuild(date: string): Promise<void> {
        if (await readReplay(date)) return; // 다른 요청이 이미 구웠으면 skip
        await writeReplay(await this.replay.dayReplay(date));
    }
}
