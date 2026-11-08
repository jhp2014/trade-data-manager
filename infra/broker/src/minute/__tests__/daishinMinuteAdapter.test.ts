import { describe, expect, it } from "vitest";
import type { DaishinBar, DaishinMinuteDay } from "@trade-data-manager/daishin";
import { DaishinMinuteAdapter, synthesizeUnBar } from "../daishinMinuteAdapter.js";

const b = (end: number, o: number, h: number, l: number, c: number, v: number): DaishinBar => ({
    end,
    open: String(o),
    high: String(h),
    low: String(l),
    close: String(c),
    volume: String(v),
    amount: "0",
});
const adapter = (day: DaishinMinuteDay | null) => new DaishinMinuteAdapter({ readMinuteDay: async () => day });

describe("synthesizeUnBar", () => {
    it("거래량 합·고가 max·저가 min·시가/종가 KRX", () => {
        const k = { open: "100", high: "105", low: "99", close: "103", volume: "55499" };
        const n = { open: "101", high: "106", low: "98", close: "104", volume: "20889" };
        expect(synthesizeUnBar(k, n)).toEqual({ open: "100", high: "106", low: "98", close: "103", volume: "76388" });
        expect(synthesizeUnBar(undefined, n)).toBe(n);
        expect(synthesizeUnBar(k, undefined)).toBe(k);
    });
});

describe("DaishinMinuteAdapter", () => {
    it("봉 끝 → 시작, KRX 동시호가 1530 은 15:30, NXT 단독 분은 krx=null, 거래량 0 은 버린다", async () => {
        const got = await adapter({
            krx: [b(901, 100, 105, 99, 103, 55499), b(902, 103, 103, 103, 103, 0), b(1530, 110, 110, 110, 110, 900)],
            nxt: [b(801, 98, 99, 97, 99, 50), b(901, 101, 106, 98, 104, 20889), b(1541, 111, 111, 111, 111, 7)],
        }).getMinuteCandles("035720", "2025-07-15");
        expect(got.map((c) => [c.time, c.un.volume, c.krx?.volume ?? null])).toEqual([
            ["08:00:00", "50", null],
            ["09:00:00", "76388", "55499"],
            ["15:30:00", "900", "900"],
            ["15:40:00", "7", null],
        ]);
        expect(got[1].un).toEqual({ open: "100", high: "106", low: "98", close: "103", volume: "76388" });
        expect(got.every((c) => c.stockCode === "035720" && c.date === "2025-07-15")).toBe(true);
    });

    it("마감 예외는 KRX 뿐 — NXT 1530 은 15:29 봉이다", async () => {
        const got = await adapter({ krx: [b(1530, 5, 5, 5, 5, 9)], nxt: [b(1530, 6, 6, 6, 6, 1)] }).getMinuteCandles("005930", "2025-05-20");
        expect(got.map((c) => [c.time, c.un.volume, c.krx?.volume ?? null])).toEqual([
            ["15:29:00", "1", null],
            ["15:30:00", "9", "9"],
        ]);
    });

    it("KRX 체결이 없으면 거절한다 — 토스 KRX 봉이 조용히 지워지지 않게", async () => {
        await expect(adapter({ krx: [b(901, 1, 1, 1, 1, 0)], nxt: [b(801, 1, 1, 1, 1, 5)] }).getMinuteCandles("005930", "2025-05-20")).rejects.toThrow(
            "KRX 체결 봉이 없다",
        );
    });

    it("수능일은 마감이 16:30 이다", async () => {
        const got = await adapter({ krx: [b(1530, 1, 1, 1, 1, 1), b(1630, 2, 2, 2, 2, 2)], nxt: [] }).getMinuteCandles("005930", "2025-11-13");
        expect(got.map((c) => c.time)).toEqual(["15:29:00", "16:30:00"]);
    });

    it("원천 파일이 없거나 한 시장에 같은 시각이 둘이면 실패한다", async () => {
        await expect(adapter(null).getMinuteCandles("005930", "2025-05-20")).rejects.toThrow("원천 파일이 없다");
        await expect(
            adapter({ krx: [b(901, 1, 1, 1, 1, 1), b(901, 1, 1, 1, 1, 1)], nxt: [] }).getMinuteCandles("005930", "2025-05-20"),
        ).rejects.toThrow("같은 시각 09:00:00");
    });
});
