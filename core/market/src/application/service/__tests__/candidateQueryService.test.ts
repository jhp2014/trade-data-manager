import { describe, it, expect } from "vitest";
import { CandidateQueryService } from "../candidateQueryService.js";
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
const candle = (stockCode: string, date: string, un: DailyBar): DailyCandle => ({ stockCode, date, krx: un, un });

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
}

describe("previewCandidates", () => {
    it("범위 각 거래일의 후보 수(비거래일 제외)", async () => {
        const repo = new FakeScanRepo({
            "2026-06-25": [candle("A", "2026-06-25", bar("100"))],
            "2026-06-26": [
                candle("A", "2026-06-26", bar("110", "115", "1")), // 전일100 → 고가 +15%
                candle("B", "2026-06-26", bar("100", "100", "1")), // +0%
            ],
        });
        const q = new CandidateQueryService({ scanRepo: repo });
        const out = await q.previewCandidates(
            { from: "2026-06-25", to: "2026-06-27" },
            { amountRankN: 0, amountFloorWon: "999999999", highRateCutPercent: 3 },
        );
        expect(out).toEqual([
            { date: "2026-06-25", scanned: 1, candidates: 0 }, // prev 없음 → rate 없음, 순위0·floor무 → 0
            { date: "2026-06-26", scanned: 2, candidates: 1 }, // A(+15%)만
            // 06-27 데이터 없음 → 제외
        ]);
    });

    it("데이터 없으면 빈 배열", async () => {
        const q = new CandidateQueryService({ scanRepo: new FakeScanRepo({}) });
        expect(await q.previewCandidates({ from: "2026-06-01", to: "2026-06-03" })).toEqual([]);
    });
});
