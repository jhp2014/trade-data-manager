// makeDayFlowByDate 의 조립만 본다(분당 파생 계산은 core deriveMinutes 테스트 몫) —
// universe 빈 날 · 분봉 없는 종목 skip · 시총 조인(없으면 null) · wire 필드만 나가는지.
import { describe, expect, it } from "vitest";
import type { MinuteCandle } from "@trade-data-manager/market";
import { makeDayFlowByDate } from "./dayFlow.js";

const bar = { open: "100", high: "110", low: "90", close: "105", volume: "10" };
const minuteOf = (code: string): MinuteCandle => ({ stockCode: code, date: "2025-01-02", time: "09:00:00", krx: bar, un: bar });
const HAS_MINUTES = new Set(["000001", "000002"]);

function makeFlow(codes: string[]) {
    return makeDayFlowByDate({
        universe: { stockCodesByDate: async () => codes },
        minute: { getMinuteCandles: async (code) => (HAS_MINUTES.has(code) ? [minuteOf(code)] : []) },
        rawDaily: { getRawDailyCandles: async () => [] },
        adjDaily: { getDailyCandles: async () => [] },
        marketCap: {
            getPreviousByDateAndCodes: async () => [{ stockCode: "000001", date: "2025-01-01", marketCap: "123" }],
        },
    });
}

describe("makeDayFlowByDate", () => {
    it("universe 빈 날 = 빈 봉투", async () => {
        expect(await makeFlow([])("2025-01-02")).toEqual({ date: "2025-01-02", stocks: [] });
    });
    it("분봉 없는 종목은 skip, 시총은 직전 거래일 행 조인(행 없으면 null) — wire 필드만", async () => {
        const flow = await makeFlow(["000001", "000002", "000003"])("2025-01-02");
        expect(flow.date).toBe("2025-01-02");
        expect(flow.stocks.map((s) => s.code)).toEqual(["000001", "000002"]); // 000003 은 분봉 없음 → skip
        const s = flow.stocks[0];
        expect(Object.keys(s).sort()).toEqual(
            ["basePrice", "code", "cumAmount", "high", "low", "marketCap", "open", "rate", "times"].sort(),
        );
        expect(s.marketCap).toBe("123");
        expect(flow.stocks[1].marketCap).toBeNull(); // 시총 행 없는 종목 — undefined 로 칸이 사라지면 안 된다
        expect(s.times).toHaveLength(1);
        expect(s.rate).toHaveLength(1);
    });
});
