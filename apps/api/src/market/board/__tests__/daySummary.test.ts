import { describe, it, expect } from "vitest";
import { buildDaySummary, type DailySnapshot } from "../daySummary.js";

const snap = (over: Partial<DailySnapshot>): DailySnapshot => ({
    date: "2026-06-26",
    stockCode: "000000",
    name: null,
    market: null,
    changeRate: null,
    openPct: null,
    highPct: null,
    lowPct: null,
    amount: null,
    marketCap: null,
    themes: [],
    issues: [],
    ...over,
});

describe("buildDaySummary", () => {
    it("byTheme/byIssue 를 stocks 한 패스로 파생 — 다중테마 종목은 각 키에 등장", () => {
        const stocks = [
            snap({ stockCode: "A", themes: [{ theme: "반도체" }, { theme: "AI" }], issues: [{ issue: "HBM", author: "me" }] }),
            snap({ stockCode: "B", themes: [{ theme: "반도체" }] }),
            snap({ stockCode: "C" }), // 미분류·이슈없음 → 어느 인덱스에도 없음
        ];
        const s = buildDaySummary("2026-06-26", stocks);
        expect(s.stockCount).toBe(3);
        expect(s.byTheme).toEqual({ 반도체: ["A", "B"], AI: ["A"] });
        expect(s.byIssue).toEqual({ HBM: ["A"] });
        expect(s.themes).toEqual(["반도체", "AI"]);
        expect(s.issues).toEqual(["HBM"]);
        expect(s.stocks).toBe(stocks); // 캐노니컬 그대로(참조 유지)
    });

    it("같은 키 중복 종목 dedup", () => {
        // 한 종목이 같은 테마를 두 행으로 갖는 비정상 입력도 코드 중복 없이.
        const stocks = [snap({ stockCode: "A", themes: [{ theme: "반도체" }, { theme: "반도체" }] })];
        expect(buildDaySummary("2026-06-26", stocks).byTheme).toEqual({ 반도체: ["A"] });
    });

    it("빈 입력", () => {
        const s = buildDaySummary("2026-06-26", []);
        expect(s).toEqual({
            date: "2026-06-26",
            stockCount: 0,
            themes: [],
            issues: [],
            byTheme: {},
            byIssue: {},
            stocks: [],
        });
    });
});
