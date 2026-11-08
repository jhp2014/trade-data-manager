import { describe, it, expect } from "vitest";
import { KiwoomMinuteAdapter, type KiwoomMinuteSource } from "../kiwoomMinuteAdapter.js";
import { KisMinuteAdapter, type KisMinuteSource } from "../kisMinuteAdapter.js";
import { TossMinuteAdapter, type TossMinuteSource } from "../tossMinuteAdapter.js";
import type { KiwoomMinuteCandle } from "@trade-data-manager/kiwoom";
import type { KisMinuteCandle } from "@trade-data-manager/kis";
import type { TossDayCandle, TossDayMinutesOptions } from "@trade-data-manager/toss";

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

const tossBar = (date: string, end: string, vol: string, price = "100"): TossDayCandle => ({
    timestamp: `${date}T${end}.000+09:00`,
    kstTime: end,
    openPrice: price,
    highPrice: price,
    lowPrice: price,
    closePrice: price,
    volume: vol,
    currency: "KRW",
});
const tossSource = (candles: TossDayCandle[]) => {
    const calls: { date: string; options?: TossDayMinutesOptions }[] = [];
    const source: TossMinuteSource = {
        async getMinuteCandlesForDate(_symbol, date, options) {
            calls.push({ date, options });
            return { candles, pages: 1, duplicates: 0 };
        },
    };
    return { source, calls };
};

describe("TossMinuteAdapter", () => {
    it("NXT 전: 봉 끝→시작, 동시호가 15:30 은 그대로, 채움 봉 제거, KRX 칸 = 통합, 구간·원주가로 요청", async () => {
        const d = "2023-06-15";
        const { source, calls } = tossSource([
            tossBar(d, "09:01:00", "5"),
            tossBar(d, "09:02:00", "0"), // 채움 봉
            tossBar(d, "15:20:00", "7"),
            tossBar(d, "15:30:00", "99"), // 동시호가
            tossBar(d, "19:58:00", "0"),
        ]);
        const out = await new TossMinuteAdapter(source).getMinuteCandles("005930", d);
        expect(out.map((c) => [c.time, c.un.volume])).toEqual([
            ["09:00:00", "5"],
            ["15:19:00", "7"],
            ["15:30:00", "99"],
        ]);
        expect(out.every((c) => c.krx !== null && c.krx.volume === c.un.volume)).toBe(true);
        expect(calls[0].options).toEqual({ adjusted: false, window: { from: "09:01:00", to: "15:31:00" } });
    });

    it("NXT 뒤: 동시호가 15:31 도 15:30 에 두고, 구간을 좁히지 않고, KRX 칸은 비운다", async () => {
        const d = "2025-04-15";
        const { source, calls } = tossSource([
            tossBar(d, "08:01:00", "3"),
            tossBar(d, "15:20:00", "7"),
            tossBar(d, "15:31:00", "99"),
            tossBar(d, "15:41:00", "4"),
            tossBar(d, "20:00:00", "6"),
        ]);
        const out = await new TossMinuteAdapter(source).getMinuteCandles("005930", d);
        expect(out.map((c) => c.time)).toEqual(["08:00:00", "15:19:00", "15:30:00", "15:40:00", "19:59:00"]);
        expect(out.every((c) => c.krx === null)).toBe(true);
        expect(calls[0].options).toEqual({ adjusted: false });
    });

    it("수능일: 16:30 까지 받고, 15:30 은 장중 봉이라 1분 빼며, 16:30 이 동시호가다", async () => {
        const d = "2023-11-16";
        const { source, calls } = tossSource([
            tossBar(d, "10:01:00", "1"),
            tossBar(d, "15:30:00", "2"),
            tossBar(d, "15:31:00", "3"),
            tossBar(d, "16:20:00", "4"),
            tossBar(d, "16:30:00", "9"),
        ]);
        const out = await new TossMinuteAdapter(source).getMinuteCandles("005930", d);
        expect(out.map((c) => c.time)).toEqual(["10:00:00", "15:29:00", "15:30:00", "16:19:00", "16:30:00"]);
        expect(calls[0].options?.window).toEqual({ from: "09:01:00", to: "16:31:00" });
    });

    it("거래량이 수치가 아니면 채움 봉처럼 버리지 않고 실패한다", async () => {
        const d = "2023-06-15";
        const { source } = tossSource([{ ...tossBar(d, "09:01:00", "5"), volume: "abc" }]);
        await expect(new TossMinuteAdapter(source).getMinuteCandles("005930", d)).rejects.toThrow("수치가 아니다");
    });

    it("동시호가 두 표기가 한 날에 다 체결되면 조용히 합치지 않고 실패한다", async () => {
        const d = "2025-04-15";
        const { source } = tossSource([tossBar(d, "15:30:00", "1"), tossBar(d, "15:31:00", "2")]);
        await expect(new TossMinuteAdapter(source).getMinuteCandles("005930", d)).rejects.toThrow("체결 봉이 둘");
    });

    it("거래량이 깨진 날(2023-02-10)은 토스를 부르지도 않고 거절한다", async () => {
        const d = "2023-02-10";
        const { source, calls } = tossSource([tossBar(d, "09:01:00", "5")]);
        await expect(new TossMinuteAdapter(source).getMinuteCandles("005930", d)).rejects.toThrow("깨진 날");
        expect(calls).toHaveLength(0);
    });
});
