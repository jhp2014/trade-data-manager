import { describe, it, expect } from "vitest";
import { MinuteCollector } from "../minuteCollector.js";
import { MinuteSweepService } from "../minuteSweepService.js";
import type { DailyBar, DailyCandle, DateRange, MinuteCandle } from "#domain";
import type { DailyScanRepository, MinuteCandleProvider, MinuteCandleStore } from "#port/collect";

// 재개(diff) 정책 검증: 기대집합(일봉 재계산 후보) − 저장집합 = 재수집 대상.
// 부분 실패/부분 저장이 다음 실행에서 이어지는지(영구 누락으로 굳지 않는지)가 핵심.
const BIG = "30000000000"; // 300억 → 후보(≥200억 floor)
const SMALL = "1"; //          후보 아님(floor·순위·등락률 모두 미달)
const D = "2026-06-26";

const dbar = (amount: string): DailyBar => ({ open: "100", high: "100", low: "100", close: "100", volume: "1", amount });
const daily = (stockCode: string, date: string, amount: string): DailyCandle => {
    const b = dbar(amount);
    return { stockCode, date, krx: b, un: b };
};
const mcandle = (stockCode: string, date: string): MinuteCandle => ({
    stockCode,
    date,
    time: "09:00:00",
    krx: null,
    un: { open: "100", high: "100", low: "100", close: "100", volume: "10" },
});

class FakeScanRepo implements DailyScanRepository {
    constructor(private byDate: Record<string, DailyCandle[]>) {}
    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        return this.byDate[date] ?? [];
    }
    async getPreviousTradingDate(date: string): Promise<string | null> {
        const e = Object.keys(this.byDate).filter((d) => d < date).sort();
        return e.length ? e[e.length - 1] : null;
    }
    async getLatestDailyDate(): Promise<string | null> {
        const d = Object.keys(this.byDate).sort();
        return d.length ? d[d.length - 1] : null;
    }
    async listTradedStockCodes(): Promise<string[]> {
        return [];
    }
    async listTradedDates(range: DateRange): Promise<string[]> {
        return Object.keys(this.byDate)
            .filter((d) => d >= range.from && d <= range.to)
            .sort();
    }
}

class FakeMinuteProvider implements MinuteCandleProvider {
    fetched: string[] = [];
    failCodes = new Set<string>();
    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        this.fetched.push(stockCode);
        if (this.failCodes.has(stockCode)) throw new Error(`boom ${stockCode}`);
        return [mcandle(stockCode, date)];
    }
}

class FakeMinuteRepo implements MinuteCandleStore {
    stored: Record<string, Set<string>> = {};
    async saveMinuteCandles(candles: MinuteCandle[]): Promise<void> {
        for (const c of candles) (this.stored[c.date] ??= new Set()).add(c.stockCode);
    }
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return [];
    }
    async getMinuteStockCodesOnDate(date: string): Promise<string[]> {
        return [...(this.stored[date] ?? [])];
    }
    async deleteMinuteCandlesOnDate(date: string): Promise<number> {
        const n = this.stored[date]?.size ?? 0;
        delete this.stored[date];
        return n;
    }
}

function makeCollector(byDate: Record<string, DailyCandle[]>) {
    const scanRepo = new FakeScanRepo(byDate);
    const minuteProvider = new FakeMinuteProvider();
    const minuteRepo = new FakeMinuteRepo();
    const minuteSweep = new MinuteSweepService({ scanRepo, minuteProvider, minuteRepo });
    const collector = new MinuteCollector({ scanRepo, minuteSweep, minuteRepo });
    return { collector, minuteProvider, minuteRepo };
}

describe("MinuteCollector 재개 정책", () => {
    it("기대집합 전부 저장된 날 = 완료로 skip(재수집 안 함)", async () => {
        const { collector, minuteProvider, minuteRepo } = makeCollector({ [D]: [daily("A", D, BIG), daily("B", D, BIG)] });
        minuteRepo.stored[D] = new Set(["A", "B"]);
        const r = await collector.collect({ from: D, to: D });
        expect(r.skippedDays).toBe(1);
        expect(r.tradingDays).toBe(0);
        expect(minuteProvider.fetched).toEqual([]);
    });

    it("부분 저장은 완료로 보지 않고 빠진 종목만 재수집", async () => {
        const { collector, minuteProvider, minuteRepo } = makeCollector({
            [D]: [daily("A", D, BIG), daily("B", D, BIG), daily("C", D, BIG)],
        });
        minuteRepo.stored[D] = new Set(["A"]); // A 만 있고 B,C 는 미수집
        const r = await collector.collect({ from: D, to: D });
        expect(r.tradingDays).toBe(1);
        expect(r.skippedDays).toBe(0);
        expect(minuteProvider.fetched.sort()).toEqual(["B", "C"]); // A 는 다시 안 긁음
        expect([...minuteRepo.stored[D]].sort()).toEqual(["A", "B", "C"]);
    });

    it("후보 없는 날(전부 프루닝)은 완료로 skip", async () => {
        const { collector, minuteProvider } = makeCollector({ [D]: [daily("A", D, SMALL)] });
        const r = await collector.collect({ from: D, to: D });
        expect(r.skippedDays).toBe(1);
        expect(minuteProvider.fetched).toEqual([]);
    });

    it("overwrite=true → 그 날 비우고 전체 후보 재수집", async () => {
        const { collector, minuteProvider, minuteRepo } = makeCollector({ [D]: [daily("A", D, BIG), daily("B", D, BIG)] });
        minuteRepo.stored[D] = new Set(["A", "B"]); // 이미 있어도 무시하고 강제
        const r = await collector.collect({ from: D, to: D }, { overwrite: true });
        expect(r.tradingDays).toBe(1);
        expect(minuteProvider.fetched.sort()).toEqual(["A", "B"]);
    });

    it("종목 실패는 격리되고 다음 실행이 실패 종목만 복구(영구 누락 방지)", async () => {
        const { collector, minuteProvider, minuteRepo } = makeCollector({
            [D]: [daily("A", D, BIG), daily("B", D, BIG), daily("C", D, BIG)],
        });
        // 1차 실행: B 가 실패 → A,C 만 저장, B 는 누락.
        minuteProvider.failCodes = new Set(["B"]);
        await collector.collect({ from: D, to: D });
        expect([...minuteRepo.stored[D]].sort()).toEqual(["A", "C"]);

        // 2차 실행: 실패가 풀리면 빠진 B 만 재수집(A,C 는 이미 완료라 건너뜀).
        minuteProvider.fetched = [];
        minuteProvider.failCodes.clear();
        const r2 = await collector.collect({ from: D, to: D });
        expect(minuteProvider.fetched).toEqual(["B"]);
        expect(r2.tradingDays).toBe(1);
        expect([...minuteRepo.stored[D]].sort()).toEqual(["A", "B", "C"]);
    });
});
