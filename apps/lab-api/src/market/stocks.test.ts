import { describe, expect, it } from "vitest";
import { makeListStocks, makeMarketCapSeries } from "./stocks.js";

describe("makeListStocks", () => {
    it("마스터 줄을 wire 꼴로(listingDate → listedAt, 미상 null 그대로) — 순서는 리더 그대로", async () => {
        const list = makeListStocks({
            listAllListings: async () => [
                { stockCode: "000001", name: "알파", market: "거래소", listingDate: "2020-03-02" },
                { stockCode: "000002", name: "베타", market: "코스닥", listingDate: null },
            ],
        });
        expect(await list()).toEqual([
            { stockCode: "000001", name: "알파", market: "거래소", listedAt: "2020-03-02" },
            { stockCode: "000002", name: "베타", market: "코스닥", listedAt: null },
        ]);
    });
});

describe("makeMarketCapSeries", () => {
    it("시총 행을 wire 꼴로(date·cap, 무손실 문자열) — 범위는 그대로 리더로 · 없으면 빈 배열", async () => {
        const seen: unknown[] = [];
        const series = makeMarketCapSeries({
            getMarketCapSeries: async (code, range) => (
                seen.push([code, range]),
                code === "000001"
                    ? [
                          { stockCode: code, date: "2025-01-02", marketCap: "1000" },
                          { stockCode: code, date: "2025-01-03", marketCap: "123456789012345678" },
                      ]
                    : []
            ),
        });
        expect(await series("000001", { from: "2025-01-01", to: "2025-01-31" })).toEqual([
            { date: "2025-01-02", cap: "1000" },
            { date: "2025-01-03", cap: "123456789012345678" },
        ]);
        expect(await series("999999", { from: "2025-01-01", to: "2025-01-31" })).toEqual([]);
        expect(seen).toEqual([
            ["000001", { from: "2025-01-01", to: "2025-01-31" }],
            ["999999", { from: "2025-01-01", to: "2025-01-31" }],
        ]);
    });
});
