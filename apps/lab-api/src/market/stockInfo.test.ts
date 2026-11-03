import { describe, expect, it } from "vitest";
import { makeStockInfo } from "./stockInfo.js";

const alpha = { stockCode: "000001", name: "알파", market: "거래소", listingDate: "2020-03-02", ipoPrice: null };

describe("makeStockInfo", () => {
    it("마스터 + 시총 행을 wire 꼴로(date·cap) — 범위는 그대로 리더로", async () => {
        const seen: unknown[] = [];
        const info = makeStockInfo({
            master: { getByStockCodes: async () => [alpha] },
            marketCap: {
                getMarketCapSeries: async (code, range) => (
                    seen.push([code, range]),
                    [
                        { stockCode: code, date: "2025-01-02", marketCap: "1000" },
                        { stockCode: code, date: "2025-01-03", marketCap: "1100" },
                    ]
                ),
            },
        });
        expect(await info("000001", { from: "2025-01-01" })).toEqual({
            stockCode: "000001",
            name: "알파",
            market: "거래소",
            listedAt: "2020-03-02",
            marketCap: [
                { date: "2025-01-02", cap: "1000" },
                { date: "2025-01-03", cap: "1100" },
            ],
        });
        expect(seen).toEqual([["000001", { from: "2025-01-01" }]]);
    });
    it("마스터에 없는 코드 = null(시총 행이 있어도) · 시총이 없으면 빈 배열", async () => {
        const none = makeStockInfo({
            master: { getByStockCodes: async () => [] },
            marketCap: { getMarketCapSeries: async (code) => [{ stockCode: code, date: "2025-01-02", marketCap: "1" }] },
        });
        expect(await none("999999", {})).toBeNull();
        const empty = makeStockInfo({
            master: { getByStockCodes: async () => [{ ...alpha, listingDate: null }] },
            marketCap: { getMarketCapSeries: async () => [] },
        });
        expect(await empty("000001", {})).toMatchObject({ listedAt: null, marketCap: [] });
    });
});
