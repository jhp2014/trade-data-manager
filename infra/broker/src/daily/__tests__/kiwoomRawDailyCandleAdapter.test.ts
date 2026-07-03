import { describe, it, expect } from "vitest";
import {
    KiwoomRawDailyCandleAdapter,
    type KiwoomRawDailyCandleSource,
} from "../kiwoomRawDailyCandleAdapter.js";
import type { KiwoomDailyCandle } from "@trade-data-manager/kiwoom";

const dRow = (dt: string, cur: string, vol: string, prica: string): KiwoomDailyCandle => ({
    dt,
    cur_prc: cur,
    trde_qty: vol,
    trde_prica: prica,
    open_pric: cur,
    high_pric: cur,
    low_pric: cur,
    pred_pre: "0",
    pred_pre_sig: "3",
});

describe("KiwoomRawDailyCandleAdapter", () => {
    it("원주가 소스(getRawDailyChartsForRange) 로 KRX·UN(_AL) 머지 + '+/-' 제거 + 거래대금 백만→원 + 절단", async () => {
        const source: KiwoomRawDailyCandleSource = {
            async getRawDailyChartsForRange(stockCode, fromDate, toDate) {
                expect(fromDate).toBe("20260701");
                expect(toDate).toBe("20260703");
                if (stockCode === "005930") {
                    return [
                        dRow("20260703", "-1000", "10", "5"),
                        dRow("20260701", "990", "8", "4"),
                        dRow("20260630", "980", "7", "3"), // 경계 밖 → 절단
                    ];
                }
                // _AL = UN
                expect(stockCode).toBe("005930_AL");
                return [dRow("20260703", "+1001", "12", "6"), dRow("20260701", "991", "9", "5")];
            },
        };
        const out = await new KiwoomRawDailyCandleAdapter(source).getRawDailyCandles("005930", {
            from: "2026-07-01",
            to: "2026-07-03",
        });

        expect(out.map((c) => c.date)).toEqual(["2026-07-01", "2026-07-03"]); // 절단 + 오름차순
        expect(out[1].krx.close).toBe("1000"); // '-' 제거
        expect(out[1].un.close).toBe("1001"); // '+' 제거
        expect(out[1].krx.amount).toBe("5000000"); // 5백만 → 5,000,000원
        expect(out[1].un.amount).toBe("6000000");
    });
});
