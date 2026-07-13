import { describe, it, expect } from "vitest";
import { dailyStatsOf, dailyStatsByMarket, trailingHighsOf, prevClosesOf, rebasePct, deriveMinutes } from "../dayReplay.js";
import type { DailyCandle, DailyBar, MinuteCandle, PreviousClose } from "../../candle/model.js";

const bar = (o: number, h: number, l: number, c: number, amount = "0"): DailyBar => ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: "0", amount });

const candle = (date: string, krx: DailyBar, un: DailyBar): DailyCandle => ({ stockCode: "000001", date, krx, un });

describe("dailyStatsOf / dailyStatsByMarket", () => {
    it("바 + 같은 시장 전일종가 → EOD %", () => {
        const s = dailyStatsOf(bar(105, 120, 100, 110, "77"), "100");
        expect(s).toEqual({ changeRate: 10, openPct: 5, highPct: 20, lowPct: 0, amount: "77" });
    });

    it("전일종가 없으면 당일 시가 폴백, 0 이면 null", () => {
        expect(dailyStatsOf(bar(100, 110, 90, 105), null)?.changeRate).toBe(5);
        expect(dailyStatsOf(bar(0, 0, 0, 0), null)).toBeNull();
    });

    it("두 벌 — 각 시장 자기 바 × 자기 전일종가(교차 없음)", () => {
        const prev: PreviousClose = { stockCode: "000001", krxClose: "100", unClose: "200" };
        const s = dailyStatsByMarket(candle("2026-07-10", bar(100, 120, 100, 110), bar(200, 250, 200, 220)), prev);
        expect(s.krx?.highPct).toBe(20); // (120-100)/100
        expect(s.un?.highPct).toBe(25); // (250-200)/200 — krx base 교차 안 함
    });
});

describe("trailingHighsOf / prevClosesOf", () => {
    const window = [
        candle("2026-07-08", bar(90, 110, 85, 100), bar(90, 112, 85, 101)),
        candle("2026-07-09", bar(100, 130, 95, 120), bar(101, 132, 96, 121)),
        candle("2026-07-10", bar(120, 150, 115, 140), bar(121, 152, 116, 142)),
    ];

    it("prevClosesOf — date 직전 최신 캔들의 시장별 close", () => {
        expect(prevClosesOf(window, "2026-07-10")).toEqual({ krx: 120, un: 121 });
        expect(prevClosesOf(window, "2026-07-08")).toEqual({ krx: null, un: null }); // 첫 봉 이전
    });

    it("시장별 자기 전일종가 대비 high%, index 0=당일, 최신→과거", () => {
        const t = trailingHighsOf(window, "2026-07-10");
        // KRX base=120: [150, 130, 110] → [25, 8.33, -8.33]
        expect(t.krx).toEqual([25, 8.33, -8.33]);
        // UN base=121: [152, 132, 112] → [25.62, 9.09, -7.44]
        expect(t.un).toEqual([25.62, 9.09, -7.44]);
    });

    it("base 없으면(상장 첫날) 빈 배열", () => {
        const t = trailingHighsOf(window, "2026-07-08");
        expect(t).toEqual({ krx: [], un: [] });
    });
});

describe("rebasePct — UN% → KRX% 일차변환", () => {
    it("직접 계산과 동치", () => {
        // v=110, unBase=100 → un%=10. krxBase=95 → krx% = (110-95)/95×100 = 15.79
        expect(rebasePct(10, 100, 95)).toBe(15.79);
        // 동일 base 면 그대로
        expect(rebasePct(10, 100, 100)).toBe(10);
    });
});

describe("deriveMinutes — 이중 trailing + rawPrevClose 스칼라", () => {
    const mBar = (o: number, h: number, l: number, c: number, v = 10) => ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: String(v) });
    const minutes: MinuteCandle[] = [
        { stockCode: "000001", date: "2026-07-10", time: "09:00:00", krx: mBar(100, 105, 99, 104), un: mBar(100, 105, 99, 104) },
        { stockCode: "000001", date: "2026-07-10", time: "09:01:00", krx: null, un: mBar(104, 110, 103, 108) },
    ];
    const rawDaily = [
        candle("2026-07-09", bar(95, 102, 94, 98), bar(96, 103, 95, 100)), // 원주가 전일: krx 98, un 100
        candle("2026-07-10", bar(100, 110, 99, 108), bar(100, 110, 99, 108)),
    ];
    const adjDaily = [
        candle("2026-07-09", bar(47.5, 51, 47, 49), bar(48, 51.5, 47.5, 50)), // 수정주가(예: 2:1 액분 반영)
        candle("2026-07-10", bar(50, 55, 49.5, 54), bar(50, 55, 49.5, 54)),
    ];

    it("분봉 %는 원주가 UN base 한 벌, rawPrevClose 는 두 스칼라", () => {
        const d = deriveMinutes("000001", minutes, rawDaily, adjDaily, "2026-07-10");
        expect(d).not.toBeNull();
        expect(d!.rawPrevClose).toEqual({ krx: 98, un: 100 });
        expect(d!.rate[0]).toBe(4); // (104-100)/100 — UN base
        // KRX 재기저는 클라 일차변환: rebasePct(4, 100, 98) = (104-98)/98×100 = 6.12
        expect(rebasePct(d!.rate[0], 100, 98)).toBe(6.12);
    });

    it("trailingHighs 는 수정주가 두 벌(자기 시장 base)", () => {
        const d = deriveMinutes("000001", minutes, rawDaily, adjDaily, "2026-07-10");
        // KRX base=49: [55, 51] → [12.24, 4.08] / UN base=50: [55, 51.5] → [10, 3]
        expect(d!.trailingHighs.krx).toEqual([12.24, 4.08]);
        expect(d!.trailingHighs.un).toEqual([10, 3]);
    });
});
