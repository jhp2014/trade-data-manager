import { describe, it, expect } from "vitest";
import type {
    DailyUniverseProvider,
    MinuteReader,
    RawDailyReader,
    AdjustedDailyReader,
    DailyCandleSnapshotReader,
    DailyMarketCapReader,
    MinuteCandle,
} from "@trade-data-manager/market";
import { DerivedCache } from "../derivedCache.js";
import { SNAPSHOT_SCHEMA_VERSION, type DaySnapshotStore, type DaySnapshotFile } from "../daySnapshotCache.js";

const V = SNAPSHOT_SCHEMA_VERSION;

// 영구캐시 게이트 검증: date < today 인 과거만 파일로 굳히고, 오늘(수집중 가능)은 굳히지 않는다.
const PAST = "2026-06-25";
const TODAY = "2026-06-26";

const mcandle = (stockCode: string, date: string): MinuteCandle => ({
    stockCode,
    date,
    time: "09:00:00",
    krx: null,
    un: { open: "100", high: "110", low: "100", close: "105", volume: "10" },
});

class FakeUniverse implements DailyUniverseProvider {
    calls: string[] = [];
    constructor(private byDate: Record<string, string[]>) {}
    async stockCodesByDate(date: string): Promise<string[]> {
        this.calls.push(date);
        return this.byDate[date] ?? [];
    }
}
class FakeMinute implements MinuteReader {
    constructor(private byDate: Record<string, string[]>) {}
    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        return (this.byDate[date] ?? []).includes(stockCode) ? [mcandle(stockCode, date)] : [];
    }
}
class FakeRawDaily implements RawDailyReader {
    async getRawDailyCandles(): Promise<[]> {
        return [];
    }
}
class FakeAdjDaily implements AdjustedDailyReader {
    async getDailyCandles(): Promise<[]> {
        return [];
    }
}
class FakeDailyCandle implements DailyCandleSnapshotReader {
    async getByDateAndCodes(): Promise<[]> {
        return [];
    }
    async getPreviousCloses(): Promise<[]> {
        return [];
    }
}
class FakeMarketCap implements DailyMarketCapReader {
    async getByDateAndCodes(): Promise<[]> {
        return [];
    }
}
class MemStore implements DaySnapshotStore {
    map = new Map<string, DaySnapshotFile>();
    writes: string[] = [];
    async read(date: string): Promise<DaySnapshotFile | null> {
        return this.map.get(date) ?? null;
    }
    async write(file: DaySnapshotFile): Promise<void> {
        this.writes.push(file.date);
        this.map.set(file.date, file);
    }
}

function make(byDate: Record<string, string[]>, today: string, store = new MemStore()) {
    const universe = new FakeUniverse(byDate);
    const cache = new DerivedCache({
        universe,
        minute: new FakeMinute(byDate),
        rawDaily: new FakeRawDaily(),
        adjDaily: new FakeAdjDaily(),
        dailyCandle: new FakeDailyCandle(),
        marketCap: new FakeMarketCap(),
        store,
        today: () => today,
    });
    return { cache, universe, store };
}

describe("DerivedCache 영구캐시 게이트", () => {
    it("과거 날짜는 빌드 후 파일로 굳힌다", async () => {
        const { cache, store } = make({ [PAST]: ["A"] }, TODAY);
        const snap = await cache.snapshot(PAST);
        expect(snap.stocks.map((s) => s.code)).toEqual(["A"]);
        expect(store.writes).toEqual([PAST]);
    });

    it("과거 warm: 파일 있으면 재빌드 없이 반환", async () => {
        const store = new MemStore();
        store.map.set(PAST, { v: V, date: PAST, stocks: [] });
        const { cache, universe } = make({ [PAST]: ["A"] }, TODAY, store);
        const snap = await cache.snapshot(PAST);
        expect(snap).toEqual({ v: V, date: PAST, stocks: [] });
        expect(universe.calls).toEqual([]); // 빌드 안 함
    });

    it("오늘 날짜는 굳히지 않는다 — 수집 중간 부분 상태 영구화 방지", async () => {
        const { cache, store } = make({ [TODAY]: ["A"] }, TODAY);
        const snap = await cache.snapshot(TODAY);
        expect(snap.stocks.map((s) => s.code)).toEqual(["A"]); // 데이터는 반환
        expect(store.writes).toEqual([]); // 파일로는 안 굳힘
    });

    it("오늘은 매 요청 재빌드 — 이전 부분 스냅샷에 갇히지 않음", async () => {
        const { cache, universe } = make({ [TODAY]: ["A"] }, TODAY);
        await cache.snapshot(TODAY);
        await cache.snapshot(TODAY);
        expect(universe.calls).toEqual([TODAY, TODAY]);
    });

    it("오늘: 낡은 파일이 있어도 무시하고 재빌드", async () => {
        const store = new MemStore();
        store.map.set(TODAY, { v: V, date: TODAY, stocks: [] }); // 이전 부분 스냅샷 잔재
        const { cache, universe } = make({ [TODAY]: ["A"] }, TODAY, store);
        const snap = await cache.snapshot(TODAY);
        expect(snap.stocks.map((s) => s.code)).toEqual(["A"]); // 낡은 빈 파일 아닌 새 빌드
        expect(universe.calls).toEqual([TODAY]);
    });

    it("빈 universe 는 굳히지 않는다", async () => {
        const { cache, store } = make({}, TODAY);
        const snap = await cache.snapshot(PAST);
        expect(snap).toEqual({ v: V, date: PAST, stocks: [] });
        expect(store.writes).toEqual([]);
    });
});
