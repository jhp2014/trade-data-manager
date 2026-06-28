import { describe, it, expect } from "vitest";
import { KiwoomMinuteAdapter, type KiwoomMinuteSource } from "../kiwoomMinuteAdapter.js";
import { KisMinuteAdapter, type KisMinuteSource } from "../kisMinuteAdapter.js";
import type { KiwoomMinuteCandle } from "@trade-data-manager/kiwoom";
import type { KisMinuteCandle } from "@trade-data-manager/kis";

const kwRow = (cntr_tm: string, cur: string, vol: string): KiwoomMinuteCandle => ({
    cntr_tm,
    cur_prc: cur,
    trde_qty: vol,
    open_pric: cur,
    high_pric: cur,
    low_pric: cur,
});

describe("KiwoomMinuteAdapter", () => {
    it("KRX(평문)·UN(코드_AL) 두 호출 머지 + '+/-' prefix 제거 + 날짜필터", async () => {
        const source: KiwoomMinuteSource = {
            async getMinuteChartsForDate(stockCode, tradeDate) {
                expect(tradeDate).toBe("20260626");
                if (stockCode === "005930") {
                    return [kwRow("20260626090000", "-100", "5"), kwRow("20260625153000", "9", "9")];
                }
                // 코드_AL = UN: 프리마켓(08:00) 추가
                return [kwRow("20260626080000", "+98", "3"), kwRow("20260626090000", "+101", "7")];
            },
        };
        const out = await new KiwoomMinuteAdapter(source).getMinuteCandles("005930", "2026-06-26");
        expect(out.map((c) => c.time)).toEqual(["08:00:00", "09:00:00"]); // UN 시각 정본, 전일행 제외
        expect(out[0].krx).toBeNull(); // 08:00 = KRX 없음
        expect(out[0].un.close).toBe("98"); // prefix 제거
        expect(out[1].krx?.close).toBe("100"); // prefix 제거
        expect(out[1].un.close).toBe("101");
    });
});

const kisRow = (hour: string, prpr: string, vol: string): KisMinuteCandle => ({
    stck_bsop_date: "20260626",
    stck_cntg_hour: hour,
    stck_prpr: prpr,
    stck_oprc: prpr,
    stck_hgpr: prpr,
    stck_lwpr: prpr,
    cntg_vol: vol,
    acml_tr_pbmn: "0",
});

describe("KisMinuteAdapter", () => {
    it("div J(KRX)·UN 두 호출 머지, 풀데이 윈도(08:00~20:00) 인자 전달", async () => {
        const source: KisMinuteSource = {
            async collectDayMinutes(_stockCode, date, params) {
                expect(date).toBe("20260626");
                expect(params?.startTime).toBe("200000");
                expect(params?.earliestTime).toBe("080000");
                if (params?.marketDiv === "J") return [kisRow("090000", "100", "5")];
                return [kisRow("080000", "98", "3"), kisRow("090000", "101", "7")];
            },
        };
        const out = await new KisMinuteAdapter(source).getMinuteCandles("005930", "2026-06-26");
        expect(out.map((c) => c.time)).toEqual(["08:00:00", "09:00:00"]);
        expect(out[0].krx).toBeNull();
        expect(out[1].krx?.close).toBe("100");
        expect(out[1].un.close).toBe("101");
    });
});
