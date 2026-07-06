import { describe, it, expect } from "vitest";
import type { DailyCandle, DateRange } from "#domain";
import type { RawDailyCandleProvider, RawDailyStore } from "#port/collect";
import { RawDailyIngestService } from "../rawDailyIngestService.js";

const bar = (close: string) => ({
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
    amount: "1",
});
const candle = (date: string): DailyCandle => ({
    stockCode: "005930",
    date,
    krx: bar("100"),
    un: bar("100"),
});

function stubRepo() {
    const saved: DailyCandle[] = [];
    const repo: RawDailyStore = {
        async saveRawDailyCandles(c) {
            saved.push(...c);
        },
    };
    return { repo, saved };
}

describe("RawDailyIngestService", () => {
    it("주어진 range 로 수집→저장(append-only, 자가치유 없음)", async () => {
        let seenRange: DateRange | undefined;
        const provider: RawDailyCandleProvider = {
            async getRawDailyCandles(_code, range) {
                seenRange = range;
                return [candle("2026-07-01"), candle("2026-07-02")];
            },
        };
        const { repo, saved } = stubRepo();
        const svc = new RawDailyIngestService({ rawProvider: provider, rawRepo: repo });

        const r = await svc.ingestRawDailyCandles("005930", { from: "2026-07-01", to: "2026-07-02" });
        expect(seenRange).toEqual({ from: "2026-07-01", to: "2026-07-02" });
        expect(r.saved).toBe(2);
        expect(saved.map((c) => c.date)).toEqual(["2026-07-01", "2026-07-02"]);
    });

    it("range 미지정 시 기본 창(today 주입 결정성) 을 provider 에 전달", async () => {
        let seenRange: DateRange | undefined;
        const provider: RawDailyCandleProvider = {
            async getRawDailyCandles(_code, range) {
                seenRange = range;
                return [];
            },
        };
        const { repo } = stubRepo();
        const svc = new RawDailyIngestService({
            rawProvider: provider,
            rawRepo: repo,
            today: () => "2026-07-03",
        });

        await svc.ingestRawDailyCandles("005930");
        expect(seenRange?.to).toBe("2026-07-03");
        expect(seenRange?.from).toBeDefined();
        expect(seenRange!.from < seenRange!.to).toBe(true); // 과거로 뻗은 창
    });
});
