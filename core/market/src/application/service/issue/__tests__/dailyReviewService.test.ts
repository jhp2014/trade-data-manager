import { describe, it, expect } from "vitest";
import { DailyReviewService } from "../dailyReviewService.js";
import type { ThemeMember, StockMaster, DailyMarketCap, DailyIssue } from "#domain";

interface Data {
    universe: string[];
    members?: ThemeMember[];
    masters?: StockMaster[];
    caps?: DailyMarketCap[];
    issues?: DailyIssue[];
}

const master = (stockCode: string, name: string): StockMaster => ({
    stockCode,
    name,
    market: "코스닥",
    listingDate: null,
    ipoPrice: null,
});

function service(d: Data) {
    return new DailyReviewService({
        universe: { stockCodesByDate: async () => d.universe },
        membership: { load: async () => d.members ?? [] },
        stockMaster: {
            getByStockCodes: async (codes) => (d.masters ?? []).filter((m) => codes.includes(m.stockCode)),
            saveStockMasters: async () => {},
            updateIpoPrice: async () => {},
        },
        marketCap: {
            getByDateAndCodes: async (_date, codes) => (d.caps ?? []).filter((c) => codes.includes(c.stockCode)),
            saveMarketCaps: async () => {},
        },
        dailyIssue: {
            getByDate: async () => d.issues ?? [],
            add: async () => {},
            remove: async () => {},
        },
    });
}

const date = "2026-06-26";

describe("DailyReviewService", () => {
    it("universe 주도 — 시트에 없는 종목도 행으로(미분류), 누락 없음", async () => {
        const rows = await service({
            universe: ["005930", "999999"],
            members: [{ theme: "반도체", code: "005930" }],
        }).reviewByDate(date);
        expect(rows.map((r) => r.stockCode)).toEqual(["005930", "999999"]);
        expect(rows.find((r) => r.stockCode === "005930")?.candidateThemes).toEqual(["반도체"]);
        expect(rows.find((r) => r.stockCode === "999999")?.candidateThemes).toEqual([]); // 미분류
    });

    it("다중테마 종목 → 후보 여러 개", async () => {
        const rows = await service({
            universe: ["111111"],
            members: [
                { theme: "원전", code: "111111" },
                { theme: "초전도체", code: "111111" },
            ],
        }).reviewByDate(date);
        expect(rows[0].candidateThemes).toEqual(["원전", "초전도체"]);
    });

    it("시트에만 있고 universe 에 없는 종목은 출력에서 빠짐(universe 주도)", async () => {
        const rows = await service({
            universe: ["005930"],
            members: [
                { theme: "반도체", code: "005930" },
                { theme: "바이오", code: "222222" },
            ],
        }).reviewByDate(date);
        expect(rows.map((r) => r.stockCode)).toEqual(["005930"]);
    });

    it("name·marketCap stitch + 결손은 null", async () => {
        const rows = await service({
            universe: ["005930", "000660"],
            masters: [master("005930", "삼성전자")], // 000660 master 없음
            caps: [{ stockCode: "000660", date, marketCap: "1000" }], // 005930 cap 없음
        }).reviewByDate(date);
        const a = rows.find((r) => r.stockCode === "005930")!;
        const b = rows.find((r) => r.stockCode === "000660")!;
        expect([a.name, a.marketCap]).toEqual(["삼성전자", null]);
        expect([b.name, b.marketCap]).toEqual([null, "1000"]);
    });

    it("확정이슈 stitch — 한 종목 2이슈 묶임", async () => {
        const rows = await service({
            universe: ["111111"],
            issues: [
                { date, stockCode: "111111", issue: "원전", author: "me" },
                { date, stockCode: "111111", issue: "초전도체", author: "me" },
            ],
        }).reviewByDate(date);
        expect(rows[0].confirmedIssues.map((i) => i.issue)).toEqual(["원전", "초전도체"]);
    });

    it("universe 비면 빈 배열", async () => {
        expect(await service({ universe: [] }).reviewByDate(date)).toEqual([]);
    });
});
