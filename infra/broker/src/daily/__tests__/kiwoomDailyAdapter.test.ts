import { describe, it, expect } from "vitest";
import { KiwoomDailyAdapter, type KiwoomDailySource } from "../kiwoomDailyAdapter.js";
import type { KiwoomDailyCandle } from "@trade-data-manager/kiwoom";

const dRow = (
    dt: string,
    cur: string,
    vol: string,
    prica: string,
): KiwoomDailyCandle => ({
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

describe("KiwoomDailyAdapter", () => {
    it("KRX(평문)·UN(코드_AL) 머지 + '+/-' 제거 + 거래대금 백만원→원 + [from,to] 절단", async () => {
        const source: KiwoomDailySource = {
            async getDailyChartsForRange(stockCode, fromDate, toDate) {
                expect(fromDate).toBe("20260624");
                expect(toDate).toBe("20260626");
                // 경계 밖(20260623) 한 건 섞어 보냄 → 어댑터가 절단해야 함.
                if (stockCode === "005930") {
                    return [
                        dRow("20260626", "-1000", "10", "5"),
                        dRow("20260624", "990", "8", "4"),
                        dRow("20260623", "980", "7", "3"),
                    ];
                }
                // 코드_AL = UN: KRX 와 같은 날짜 집합(통합값은 다를 수 있으나 여기선 거래대금만 키움)
                return [
                    dRow("20260626", "+1001", "12", "6"),
                    dRow("20260624", "991", "9", "5"),
                ];
            },
        };
        const out = await new KiwoomDailyAdapter(source).getDailyCandles("005930", {
            from: "2026-06-24",
            to: "2026-06-26",
        });

        expect(out.map((c) => c.date)).toEqual(["2026-06-24", "2026-06-26"]); // 절단 + 오름차순
        expect(out[1].krx.close).toBe("1000"); // prefix 제거
        expect(out[1].un.close).toBe("1001");
        expect(out[1].krx.amount).toBe("5000000"); // 5백만원 → 5,000,000원
        expect(out[1].un.amount).toBe("6000000");
    });

    it("UN 날짜에 KRX 바가 없으면 건너뛴다(데이터 이상 방어)", async () => {
        const source: KiwoomDailySource = {
            async getDailyChartsForRange(stockCode) {
                if (stockCode === "005930") return [dRow("20260626", "1000", "10", "5")];
                // UN 에만 있는 날짜(20260625) — KRX 부재
                return [
                    dRow("20260626", "1001", "12", "6"),
                    dRow("20260625", "1002", "11", "7"),
                ];
            },
        };
        const out = await new KiwoomDailyAdapter(source).getDailyCandles("005930", {
            from: "2026-06-25",
            to: "2026-06-26",
        });
        expect(out.map((c) => c.date)).toEqual(["2026-06-26"]); // 20260625 는 KRX 없어 제외
    });
});
