import { describe, expect, it } from "vitest";
import { MinuteRepairService } from "../minuteRepairService.js";
import type { DateRange, MinuteCandle } from "#domain";
import type { MinuteCandleProvider, MinuteRepairStore, MinuteStockDay } from "#port/collect";

const candle = (stockCode: string, date: string, time = "09:00:00"): MinuteCandle => ({
    stockCode,
    date,
    time,
    krx: null,
    un: { open: "1", high: "1", low: "1", close: "1", volume: "1" },
});

class FakeStore implements MinuteRepairStore {
    replaced = new Map<string, MinuteCandle[]>();
    constructor(private targets: MinuteStockDay[]) {}
    async listNxtLostMinuteDays(_range: DateRange): Promise<MinuteStockDay[]> {
        return this.targets;
    }
    async replaceMinuteCandlesOfDay(stockCode: string, date: string, candles: MinuteCandle[]): Promise<void> {
        this.replaced.set(`${stockCode}|${date}`, candles);
    }
}

const provider = (byKey: Record<string, MinuteCandle[] | Error>): MinuteCandleProvider => ({
    async getMinuteCandles(stockCode, date) {
        const v = byKey[`${stockCode}|${date}`];
        if (v instanceof Error) throw v;
        return v ?? [];
    },
});

const A = { stockCode: "000040", date: "2025-05-20" };
const B = { stockCode: "000050", date: "2025-05-20" };
const C = { stockCode: "000060", date: "2025-05-19" };

describe("MinuteRepairService", () => {
    it("대상은 저장소가 정한다", async () => {
        const svc = new MinuteRepairService({ store: new FakeStore([A]), minuteProvider: provider({}) });
        expect(await svc.findTargets({ from: "2025-03-04", to: "2025-06-30" })).toEqual([A]);
    });

    it("받은 종목-날만 바꾸고, 못 받은·빈·섞인 것은 실패로 남긴다", async () => {
        const store = new FakeStore([]);
        const svc = new MinuteRepairService({
            store,
            minuteProvider: provider({
                "000040|2025-05-20": [candle("000040", "2025-05-20")],
                "000050|2025-05-20": new Error("원천 파일 없음"),
                "000060|2025-05-19": [candle("000060", "2025-05-20")],
            }),
        });
        const empty = { stockCode: "000070", date: "2025-05-20" };
        const r = await svc.repair([A, B, C, empty]);
        expect(r.replaced).toEqual([A]);
        expect([...store.replaced.keys()]).toEqual(["000040|2025-05-20"]);
        expect(r.failed.map((f) => [f.stockCode, f.error])).toEqual([
            ["000060", "다른 종목-날 봉이 섞였다 (000060 2025-05-20)"],
            ["000050", "원천 파일 없음"],
            ["000070", "새 소스가 빈 분봉을 줬다"],
        ]);
    });

    it("dryRun 은 검사만 하고 쓰지 않는다", async () => {
        const store = new FakeStore([]);
        const svc = new MinuteRepairService({ store, minuteProvider: provider({ "000040|2025-05-20": [candle("000040", "2025-05-20")] }) });
        const r = await svc.repair([A], { dryRun: true });
        expect(r.replaced).toEqual([A]);
        expect(store.replaced.size).toBe(0);
    });
});
