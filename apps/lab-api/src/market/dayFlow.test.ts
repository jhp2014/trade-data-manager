// makeDayFlowByDate 의 조립만 본다(채움·대금·기준가 계산은 core 테스트 몫) —
// universe 빈 날 · 분봉 없는 종목 skip · 시총 조인(없으면 null) · 분당 원값(%·누적 아님) · wire 필드만 나가는지.
import { describe, expect, it } from "vitest";
import { kstToUnix, type MinuteCandle } from "@trade-data-manager/market";
import { makeDayFlowByDate } from "./dayFlow.js";

// krx 바는 일부러 다른 값 — 조립이 실수로 m.krx 를 읽으면 숫자가 달라져 테스트가 잡는다.
const un = { open: "100", high: "110", low: "90", close: "105", volume: "10" };
const krx = { open: "999", high: "999", low: "999", close: "999", volume: "99" };
const minuteOf = (code: string, time: string, bar = un): MinuteCandle => ({ stockCode: code, date: "2025-01-02", time, krx, un: bar });
const un2 = { open: "106", high: "108", low: "104", close: "107", volume: "20" };
// 000001 은 09:00·09:02(갭 1분 — dense flat-fill 검증), 000002 는 09:00 하나, 000003 은 분봉 없음.
const MINUTES: Record<string, MinuteCandle[]> = {
    "000001": [minuteOf("000001", "09:00:00"), minuteOf("000001", "09:02:00", un2)],
    "000002": [minuteOf("000002", "09:00:00")],
};

function makeFlow(codes: string[]) {
    return makeDayFlowByDate({
        universe: { stockCodesByDate: async () => codes },
        minute: { getMinuteCandles: async (code) => MINUTES[code] ?? [] },
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
    it("분봉 없는 종목은 skip, 시총은 직전 거래일 행 조인(행 없으면 null) — UN 분당 원값·dense 채움·wire 필드만", async () => {
        const flow = await makeFlow(["000001", "000002", "000003"])("2025-01-02");
        expect(flow.date).toBe("2025-01-02");
        expect(flow.stocks.map((s) => s.code)).toEqual(["000001", "000002"]); // 000003 은 분봉 없음 → skip
        const s = flow.stocks[0];
        expect(Object.keys(s).sort()).toEqual(
            ["amount", "basePrice", "close", "code", "high", "low", "marketCap", "open", "times"].sort(),
        );
        expect(s.marketCap).toBe("123");
        expect(flow.stocks[1].marketCap).toBeNull(); // 시총 행 없는 종목 — undefined 로 칸이 사라지면 안 된다
        // 09:00·09:02 입력 → dense 3분: 09:01 은 직전 종가 평탄봉(대금 0). 값은 UN 바(krx 999 가 섞이면 틀린다).
        expect(s.times).toEqual(["09:00:00", "09:01:00", "09:02:00"].map((t) => kstToUnix("2025-01-02", t)));
        expect(s.close).toEqual([105, 105, 107]);
        expect(s.high).toEqual([110, 105, 108]);
        expect(s.low).toEqual([90, 105, 104]);
        expect(s.open).toBe(100);
        // 대금 = 내림(OHLC 평균) × 거래량: (100+110+90+105)/4=101.25→101 ×10 = 1010 / 채움봉 0 / (106+108+104+107)/4=106.25→106 ×20 = 2120
        expect(s.amount).toEqual([1010, 0, 2120]);
        // 일봉이 비어 basePrice 는 둘 다 null — 그래도 가격은 나간다(표현·폴백은 클라 몫).
        expect(s.basePrice).toEqual({ krx: null, un: null });
    });
});
