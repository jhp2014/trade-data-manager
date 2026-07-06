import { describe, it, expect } from "vitest";
import { DaySummaryService } from "../daySummaryService.js";
import type {
    ThemeMember,
    StockMaster,
    DailyMarketCap,
    DailyIssue,
    DailyCandle,
    PreviousClose,
} from "#domain";

interface Data {
    universe: string[];
    members?: ThemeMember[];
    masters?: StockMaster[];
    caps?: DailyMarketCap[];
    candles?: DailyCandle[];
    prevCloses?: PreviousClose[];
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
    return new DaySummaryService({
        universe: { stockCodesByDate: async () => d.universe },
        membership: { load: async () => d.members ?? [] },
        stockMaster: {
            getByStockCodes: async (codes) => (d.masters ?? []).filter((m) => codes.includes(m.stockCode)),
        },
        marketCap: {
            getByDateAndCodes: async (_date, codes) => (d.caps ?? []).filter((c) => codes.includes(c.stockCode)),
        },
        dailyCandle: {
            getByDateAndCodes: async (_date, codes) => (d.candles ?? []).filter((c) => codes.includes(c.stockCode)),
            getPreviousCloses: async (_date, codes) =>
                (d.prevCloses ?? []).filter((p) => codes.includes(p.stockCode)),
        },
        dailyIssue: {
            getByDate: async () => d.issues ?? [],
            add: async () => {},
            remove: async () => {},
        },
    });
}

const date = "2026-06-26";

describe("DaySummaryService", () => {
    it("universe 주도 — 시트에 없는 종목도 스냅샷으로(미분류), 누락 없음", async () => {
        const s = await service({
            universe: ["005930", "999999"],
            members: [{ theme: "반도체", code: "005930" }],
        }).summaryByDate(date);
        expect(s.stocks.map((x) => x.stockCode)).toEqual(["005930", "999999"]);
        expect(s.stocks.find((x) => x.stockCode === "005930")?.themes.map((t) => t.theme)).toEqual(["반도체"]);
        expect(s.stocks.find((x) => x.stockCode === "999999")?.themes).toEqual([]); // 미분류
    });

    it("다중테마 종목 → ThemeTag 여러 개(편입메타 보존)", async () => {
        const s = await service({
            universe: ["111111"],
            members: [
                { theme: "원전", code: "111111", issue: "정책수혜", date: "2025-01-02" },
                { theme: "초전도체", code: "111111" },
            ],
        }).summaryByDate(date);
        expect(s.stocks[0].themes).toEqual([
            { theme: "원전", admissionIssue: "정책수혜", admissionDate: "2025-01-02" },
            { theme: "초전도체" },
        ]);
    });

    it("시트에만 있고 universe 에 없는 종목은 빠짐(universe 주도)", async () => {
        const s = await service({
            universe: ["005930"],
            members: [
                { theme: "반도체", code: "005930" },
                { theme: "바이오", code: "222222" },
            ],
        }).summaryByDate(date);
        expect(s.stocks.map((x) => x.stockCode)).toEqual(["005930"]);
    });

    it("name·marketCap stitch + 결손은 null", async () => {
        const s = await service({
            universe: ["005930", "000660"],
            masters: [master("005930", "삼성전자")], // 000660 master 없음
            caps: [{ stockCode: "000660", date, marketCap: "1000" }], // 005930 cap 없음
        }).summaryByDate(date);
        const a = s.stocks.find((x) => x.stockCode === "005930")!;
        const b = s.stocks.find((x) => x.stockCode === "000660")!;
        expect([a.name, a.marketCap]).toEqual(["삼성전자", null]);
        expect([b.name, b.marketCap]).toEqual([null, "1000"]);
    });

    it("candle·prevClose stitch — 결손이면 null", async () => {
        const candle: DailyCandle = {
            stockCode: "005930",
            date,
            krx: { open: "1", high: "2", low: "1", close: "2", volume: "10", amount: "20" },
            un: { open: "1", high: "2", low: "1", close: "2", volume: "10", amount: "20" },
        };
        const s = await service({
            universe: ["005930", "000660"],
            candles: [candle],
            prevCloses: [{ stockCode: "005930", krxClose: "1", unClose: "1" }],
        }).summaryByDate(date);
        const a = s.stocks.find((x) => x.stockCode === "005930")!;
        const b = s.stocks.find((x) => x.stockCode === "000660")!;
        expect([a.candle, a.prevCloseKrx, a.prevCloseUn]).toEqual([candle, "1", "1"]);
        expect([b.candle, b.prevCloseKrx, b.prevCloseUn]).toEqual([null, null, null]);
    });

    it("확정이슈 stitch — 한 종목 2이슈 IssueTag 로", async () => {
        const s = await service({
            universe: ["111111"],
            issues: [
                { date, stockCode: "111111", issue: "원전", author: "me", comment: "가동" },
                { date, stockCode: "111111", issue: "초전도체", author: "you" },
            ],
        }).summaryByDate(date);
        expect(s.stocks[0].issues).toEqual([
            { issue: "원전", author: "me", comment: "가동" },
            { issue: "초전도체", author: "you" },
        ]);
    });

    it("byTheme/byIssue 인덱스 파생", async () => {
        const s = await service({
            universe: ["005930", "000660"],
            members: [
                { theme: "반도체", code: "005930" },
                { theme: "반도체", code: "000660" },
            ],
            issues: [{ date, stockCode: "005930", issue: "HBM", author: "me" }],
        }).summaryByDate(date);
        expect(s.byTheme).toEqual({ 반도체: ["005930", "000660"] });
        expect(s.byIssue).toEqual({ HBM: ["005930"] });
        expect(s.themes).toEqual(["반도체"]);
        expect(s.issues).toEqual(["HBM"]);
    });

    it("universe 비면 빈 요약", async () => {
        const s = await service({ universe: [] }).summaryByDate(date);
        expect(s.stockCount).toBe(0);
        expect(s.stocks).toEqual([]);
    });
});
