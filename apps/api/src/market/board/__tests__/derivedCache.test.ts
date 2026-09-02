import { describe, it, expect } from "vitest";
import type {
    DailyUniverseProvider,
    MinuteReader,
    RawDailyReader,
    AdjustedDailyReader,
    DailyCandleSnapshotReader,
    DailyMarketCapReader,
    DailyCandle,
    MinuteCandle,
} from "@trade-data-manager/market";
import { DerivedCache, type CompletionScanReader } from "../derivedCache.js";
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

// 거래대금 300억(≥ 200억 floor) — 완료 판정의 기대집합(분봉 수집 후보)에 확실히 든다.
const dcandle = (stockCode: string, date: string): DailyCandle => {
    const bar = { open: "100", high: "110", low: "100", close: "105", volume: "10", amount: "30000000000" };
    return { stockCode, date, krx: bar, un: bar };
};

/** 완료 판정용 일봉 대역 — 기본은 universe 와 같은 코드에 floor 이상 일봉(기대집합 = 저장집합 = 완료). */
class FakeScan implements CompletionScanReader {
    constructor(private byDate: Record<string, string[]>) {}
    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        return (this.byDate[date] ?? []).map((code) => dcandle(code, date));
    }
    async getPreviousTradingDate(): Promise<string | null> {
        return null; // 전일 없음 → 고가등락률 판정 불가(floor 로만) — 기대집합 산정엔 충분
    }
}

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
    async getPreviousByDateAndCodes(): Promise<[]> {
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
    async has(date: string): Promise<boolean> {
        return this.map.has(date);
    }
}

function make(byDate: Record<string, string[]>, today: string, store = new MemStore(), dailyByDate = byDate) {
    const universe = new FakeUniverse(byDate);
    const cache = new DerivedCache({
        universe,
        scan: new FakeScan(dailyByDate),
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

// 완료 판정 게이트: 과거라도 기대집합(일봉 재계산 분봉 후보) ⊆ 저장집합일 때만 굳힌다 —
// 스윕 중단·부분 실패로 반쪽인 날을 굳히면 이후 수집이 채워도 캐시가 영구히 반쪽이었다.
describe("DerivedCache 수집 완료 게이트", () => {
    it("부분 수집(기대집합 ⊄ 저장집합)은 굳히지 않는다 — 스냅샷은 메모리에서 서빙", async () => {
        // 일봉(후보)은 A·B 둘인데 분봉은 A 만 저장됨 = 스윕이 B 를 못 끝낸 날.
        const { cache, store } = make({ [PAST]: ["A"] }, TODAY, new MemStore(), { [PAST]: ["A", "B"] });
        const snap = await cache.snapshot(PAST);
        expect(snap.stocks.map((s) => s.code)).toEqual(["A"]); // 있는 만큼은 서빙
        expect(store.writes).toEqual([]); // 반쪽을 영구화하지 않는다
    });

    it("수집이 채워진 뒤의 빌드는 굳힌다 — 자가치유", async () => {
        const store = new MemStore();
        const byDate = { [PAST]: ["A"] };
        const daily = { [PAST]: ["A", "B"] };
        const { cache } = make(byDate, TODAY, store, daily);
        await cache.snapshot(PAST);
        expect(store.writes).toEqual([]); // 아직 부분

        byDate[PAST].push("B"); // 재개 수집이 빠진 종목을 채웠다
        const snap = await cache.snapshot(PAST);
        expect(snap.stocks.map((s) => s.code).sort()).toEqual(["A", "B"]);
        expect(store.writes).toEqual([PAST]); // 이제 완료 → 굳힘
    });

    it("일봉이 없는 날은 과거라도 굳히지 않는다 — 기대집합 산정 불가 = EOD 스칼라도 부분", async () => {
        const { cache, store } = make({ [PAST]: ["A"] }, TODAY, new MemStore(), {});
        await cache.snapshot(PAST);
        expect(store.writes).toEqual([]);
    });
});
