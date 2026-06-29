import { describe, it, expect } from "vitest";
import {
    computeMarketCapBackfill,
    computeDailyMarketCaps,
    currentTotalShares,
    sharesAt,
    type ListInfoEvent,
    type MarketSnapshot,
    type RawDailyClose,
} from "../marketCap.js";

const ev = (listDate: string, issueQty: string, totalShares: string): ListInfoEvent => ({
    listDate,
    issueQty,
    totalShares,
    issuePrice: "0",
    issueType: "유상증자",
});

const close = (date: string, c: string): RawDailyClose => ({ date, close: c });

describe("currentTotalShares", () => {
    it("이벤트 0건이면 null", () => {
        expect(currentTotalShares([])).toBeNull();
    });
    it("가장 최신 이벤트의 totalShares", () => {
        const events = [ev("2026-01-10", "100", "1100"), ev("2025-06-01", "1000", "1000")];
        expect(currentTotalShares(events)).toBe("1100");
    });
});

describe("sharesAt — 현재총수에서 역산", () => {
    const events = [ev("2026-03-02", "200", "1200"), ev("2026-01-05", "1000", "1000")];
    const tot = "1200";
    it("모든 이벤트 이후(최신) 시점 = 현재총수", () => {
        expect(sharesAt(events, tot, "2026-06-01")).toBe(1200n);
    });
    it("3/2 증자 직전 = 1200 − 200", () => {
        expect(sharesAt(events, tot, "2026-03-01")).toBe(1000n);
    });
    it("1/5 증자 직전 = 1200 − 200 − 1000", () => {
        expect(sharesAt(events, tot, "2026-01-04")).toBe(0n);
    });
    it("이벤트 당일은 그 이벤트 반영(> 비교라 list_dt==t 는 차감 안 함)", () => {
        expect(sharesAt(events, tot, "2026-03-02")).toBe(1200n);
    });
    it("감자(음수 delta)도 부호 그대로 역산", () => {
        const reduced = [ev("2026-02-01", "-500", "500")];
        // 2/1 감자 직전엔 500 − (−500) = 1000.
        expect(sharesAt(reduced, "500", "2026-01-31")).toBe(1000n);
    });
});

describe("computeMarketCapBackfill", () => {
    const range = { from: "2026-06-25", to: "2026-06-26" };
    const events = [ev("2026-06-26", "100", "1100")]; // 6/26 증자 100주 → 현재 1100

    it("시총(D) = shares(D-1) × 원주가종가(D-1) — 둘 다 전날 기준", () => {
        const rawCloses = [
            close("2026-06-24", "1000"), // D-1 for 6/25
            close("2026-06-25", "2000"), // D-1 for 6/26
            close("2026-06-26", "3000"),
        ];
        const rows = computeMarketCapBackfill({
            stockCode: "005930",
            rawCloses,
            events,
            totalCurrent: "1100",
            range,
        });
        // 6/25: shares(6/24)=1100−100(6/26증자는 6/24보다 미래)=1000, ×1000 = 1,000,000
        // 6/26: shares(6/25)=1100−100=1000, ×2000 = 2,000,000
        expect(rows).toEqual([
            { stockCode: "005930", date: "2026-06-25", marketCap: "1000000" },
            { stockCode: "005930", date: "2026-06-26", marketCap: "2000000" },
        ]);
    });

    it("직전 거래일이 없는 첫 행(margin 부재)은 건너뛴다", () => {
        const rawCloses = [close("2026-06-25", "2000"), close("2026-06-26", "3000")];
        const rows = computeMarketCapBackfill({
            stockCode: "005930",
            rawCloses,
            events,
            totalCurrent: "1100",
            range,
        });
        // 6/25 는 prevTD 없음 → 스킵. 6/26 만.
        expect(rows.map((r) => r.date)).toEqual(["2026-06-26"]);
    });

    it("범위 밖 거래일은 기록 안 함(prevTD 용으로만 사용)", () => {
        const rawCloses = [
            close("2026-06-25", "2000"),
            close("2026-06-26", "3000"),
            close("2026-06-29", "4000"), // range.to 초과
        ];
        const rows = computeMarketCapBackfill({
            stockCode: "005930",
            rawCloses,
            events,
            totalCurrent: "1100",
            range,
        });
        expect(rows.map((r) => r.date)).toEqual(["2026-06-26"]);
    });
});

describe("computeDailyMarketCaps", () => {
    const snap = (stockCode: string, shares: string, prevClose: string): MarketSnapshot => ({
        stockCode,
        shares,
        prevClose,
    });

    it("시총 = shares × prevClose, 실행일 칸에 기록", () => {
        const rows = computeDailyMarketCaps(
            [snap("005930", "5846278608", "339500"), snap("000660", "712702365", "2673000")],
            "2026-06-29",
        );
        expect(rows).toEqual([
            { stockCode: "005930", date: "2026-06-29", marketCap: "1984811587416000" },
            { stockCode: "000660", date: "2026-06-29", marketCap: "1905053421645000" },
        ]);
    });

    it("0패딩 문자열(ka10099 원형)도 그대로 파싱", () => {
        const rows = computeDailyMarketCaps([snap("005380", "0000000204757766", "00480500")], "2026-06-29");
        expect(rows[0].marketCap).toBe("98386106563000");
    });

    it("shares·price 0 이하(거래정지·결손)는 제외", () => {
        const rows = computeDailyMarketCaps(
            [snap("000001", "0", "1000"), snap("000002", "1000", "0"), snap("000003", "10", "20")],
            "2026-06-29",
        );
        expect(rows.map((r) => r.stockCode)).toEqual(["000003"]);
    });
});
