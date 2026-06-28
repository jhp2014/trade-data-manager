import { describe, it, expect } from "vitest";
import { DailyCandidateService } from "../dailyCandidateService.js";
import type { DailyBar, DailyCandle } from "../../../domain/index.js";
import type { DailyScanRepository } from "../../port/outbound/index.js";

const bar = (close: string, high = close, amount = "1"): DailyBar => ({
    open: close,
    high,
    low: close,
    close,
    volume: "1",
    amount,
});

const candle = (stockCode: string, date: string, un: DailyBar): DailyCandle => ({
    stockCode,
    date,
    krx: un,
    un,
});

class FakeScanRepo implements DailyScanRepository {
    constructor(private byDate: Record<string, DailyCandle[]>) {}
    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        return this.byDate[date] ?? [];
    }
    async getPreviousTradingDate(date: string): Promise<string | null> {
        const earlier = Object.keys(this.byDate).filter((d) => d < date).sort();
        return earlier.length ? earlier[earlier.length - 1] : null;
    }
    async getLatestDailyDate(): Promise<string | null> {
        const dates = Object.keys(this.byDate).sort();
        return dates.length ? dates[dates.length - 1] : null;
    }
}

describe("selectCandidatesForDate", () => {
    it("전일종가를 직전 거래일에서 종목별로 끌어와 고가등락률 계산", async () => {
        const repo = new FakeScanRepo({
            "2026-06-25": [candle("THIN", "2026-06-25", bar("100"))], // 전일종가 100
            "2026-06-26": [candle("THIN", "2026-06-26", bar("103", "106", "1"))], // 고가106 → +6% keep
        });
        const service = new DailyCandidateService({ scanRepo: repo });
        const r = await service.selectCandidatesForDate("2026-06-26", {
            amountRankN: 0,
            amountFloorWon: "999999999",
            highRateCutPercent: 3,
        });
        expect(r.scanned).toBe(1);
        expect(r.candidates).toEqual(["THIN"]);
    });

    it("데이터 없는 날은 빈 후보", async () => {
        const service = new DailyCandidateService({ scanRepo: new FakeScanRepo({}) });
        expect(await service.selectCandidatesForDate("2026-06-26")).toEqual({
            date: "2026-06-26",
            candidates: [],
            scanned: 0,
        });
    });

    it("직전 거래일 없으면 prevClose=null → 순위/floor 로만", async () => {
        const repo = new FakeScanRepo({
            "2026-06-26": [
                candle("BIG", "2026-06-26", bar("100", "100", "50000000000")), // 500억 floor keep
                candle("SMALL", "2026-06-26", bar("100", "100", "1")),
            ],
        });
        const service = new DailyCandidateService({ scanRepo: repo });
        // 순위 keep 끔(amountRankN=0)으로 floor 단독 판정 — 2종목뿐이라 기본 N400 이면 둘 다 순위 keep 됨.
        const r = await service.selectCandidatesForDate("2026-06-26", { amountRankN: 0 });
        expect(r.candidates).toEqual(["BIG"]);
    });
});
