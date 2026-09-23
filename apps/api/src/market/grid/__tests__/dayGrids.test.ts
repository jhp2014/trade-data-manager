// DayGrids — 날짜 격자 빌더의 수명 규칙(굳히기 게이트·메모·in-flight)을 못 박는다(DB·디스크 0).
import { describe, expect, it } from "vitest";
import type { DailyCandle, DailyUniverseProvider, MinuteCandle, MinuteReader } from "@trade-data-manager/market";
import { DAY_GRID_DETECT_OPTIONS, decodeChartGrid, POINT_GRID_RULE_VERSION } from "@trade-data-manager/market";
import type { DayGridBundle } from "@trade-data-manager/wire";
import type { CompletionScanReader } from "../../board/minuteCompletion.js";
import { DayGrids } from "../dayGrids.js";
import { DAY_GRID_FILE_VERSION, isCurrentDayGridFile, type DayGridStore } from "../dayGridStore.js";

const PAST = "2026-06-25";
const TODAY = "2026-06-26";

const mcandle = (stockCode: string, date: string, time: string, p: number): MinuteCandle => ({
    stockCode, date, time, krx: null, un: { open: String(p), high: String(p), low: String(p), close: String(p), volume: "1000" },
});
const dcandle = (stockCode: string, date: string): DailyCandle => {
    const bar = { open: "100", high: "110", low: "100", close: "105", volume: "10", amount: "30000000000" };
    return { stockCode, date, krx: bar, un: bar };
};

class FakeScan implements CompletionScanReader {
    constructor(private byDate: Record<string, string[]>) {}
    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        return (this.byDate[date] ?? []).map((c) => dcandle(c, date));
    }
    async getPreviousTradingDate(): Promise<string | null> {
        return null;
    }
}
class FakeUniverse implements DailyUniverseProvider {
    calls = 0;
    constructor(private byDate: Record<string, string[]>) {}
    async stockCodesByDate(date: string): Promise<string[]> {
        this.calls++;
        return this.byDate[date] ?? [];
    }
}
class FakeMinute implements MinuteReader {
    reads = 0;
    constructor(private byDate: Record<string, string[]>) {}
    async getMinuteCandles(code: string, date: string): Promise<MinuteCandle[]> {
        this.reads++;
        if (!(this.byDate[date] ?? []).includes(code)) return [];
        return [mcandle(code, date, "09:00:00", 100), mcandle(code, date, "09:01:00", 103), mcandle(code, date, "09:02:00", 101)];
    }
}
class MemStore implements DayGridStore {
    map = new Map<string, DayGridBundle>();
    writes: string[] = [];
    async read(date: string): Promise<DayGridBundle | null> {
        return this.map.get(date) ?? null;
    }
    async write(b: DayGridBundle): Promise<void> {
        this.writes.push(b.date);
        this.map.set(b.date, b);
    }
}

function make(byDate: Record<string, string[]>, opts: { daily?: Record<string, string[]>; now?: () => number } = {}) {
    const store = new MemStore();
    const universe = new FakeUniverse(byDate);
    const minute = new FakeMinute(byDate);
    const grids = new DayGrids({
        universe,
        scan: new FakeScan(opts.daily ?? byDate),
        minute,
        rawDaily: { getRawDailyCandles: async () => [] },
        adjDaily: { getDailyCandles: async () => [] },
        store,
        today: () => TODAY,
        ...(opts.now ? { now: opts.now } : {}),
    });
    return { grids, store, universe, minute };
}

describe("DayGrids", () => {
    it("유니버스 전 종목을 기준선 없이 하루 옵션으로 굽는다(와이어 튜플 — 디코드 왕복)", async () => {
        const { grids } = make({ [PAST]: ["A", "B"] });
        const b = await grids.bundle(PAST);
        expect(b).toMatchObject({ version: POINT_GRID_RULE_VERSION, opts: DAY_GRID_DETECT_OPTIONS, date: PAST });
        const decoded = b.charts.map(decodeChartGrid);
        expect(decoded.map((d) => d.stockCode)).toEqual(["A", "B"]);
        expect(decoded.every((d) => d.grid.base === null && d.grid.touch === null)).toBe(true);
        // floor 0 — 거래량 1000 × 가격 ~100 = 0.001억짜리 사건도 실린다(게이트는 클라가 건다).
        expect(decoded[0]!.grid.newHighs.length).toBeGreaterThan(0);
    });

    it("과거 + 수집 완료면 파일로 굳히고, 다음 인스턴스는 파일에서 읽는다", async () => {
        const { grids, store } = make({ [PAST]: ["A"] });
        await grids.bundle(PAST);
        expect(store.writes).toEqual([PAST]);
    });

    it("오늘은 굳히지 않는다 — 60초 메모만, 지나면 다시 굽는다", async () => {
        let t = 0;
        const { grids, store, universe } = make({ [TODAY]: ["A"] }, { now: () => t });
        await grids.bundle(TODAY);
        t = 59_000;
        await grids.bundle(TODAY);
        expect(universe.calls).toBe(1);
        t = 61_000;
        await grids.bundle(TODAY);
        expect(universe.calls).toBe(2);
        expect(store.writes).toEqual([]);
    });

    it("과거라도 수집 미완료면 굳히지 않는다(반쪽 날의 영구화 금지)", async () => {
        // 일봉 기대집합에 C 가 있는데 분봉 유니버스엔 없다 = 미완료.
        const { grids, store } = make({ [PAST]: ["A"] }, { daily: { [PAST]: ["A", "C"] } });
        await grids.bundle(PAST);
        expect(store.writes).toEqual([]);
    });

    it("빈 유니버스는 빈 번들 — 굳히지 않는다", async () => {
        const { grids, store } = make({});
        expect((await grids.bundle(PAST)).charts).toEqual([]);
        expect(store.writes).toEqual([]);
    });

    it("동시 요청은 한 번만 굽는다(in-flight 공유)", async () => {
        const { grids, minute } = make({ [PAST]: ["A", "B"] });
        await Promise.all([grids.bundle(PAST), grids.bundle(PAST), grids.bundle(PAST)]);
        expect(minute.reads).toBe(2);
    });
});

describe("isCurrentDayGridFile — 규칙·옵션·봉투 중 하나라도 다르면 miss", () => {
    const ok = { v: DAY_GRID_FILE_VERSION, version: POINT_GRID_RULE_VERSION, opts: { ...DAY_GRID_DETECT_OPTIONS }, date: PAST, charts: [] };
    it("현재 것", () => expect(isCurrentDayGridFile(ok)).toBe(true));
    it("봉투 버전", () => expect(isCurrentDayGridFile({ ...ok, v: 0 })).toBe(false));
    it("규칙 버전", () => expect(isCurrentDayGridFile({ ...ok, version: POINT_GRID_RULE_VERSION - 1 })).toBe(false));
    it("굽기 옵션", () => expect(isCurrentDayGridFile({ ...ok, opts: { ...DAY_GRID_DETECT_OPTIONS, zigzagPct: 2 } })).toBe(false));
});
