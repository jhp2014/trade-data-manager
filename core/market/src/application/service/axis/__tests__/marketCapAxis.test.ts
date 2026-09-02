import { describe, expect, it } from "vitest";
import type { ChartRef, DailyMarketCap } from "#domain";
import { marketCapAxis } from "../marketCapAxis.js";
import type { AxisDeps } from "../axis.js";

const chart = (stockCode: string, date: string): ChartRef => ({ stockCode, date });

function deps(rows: DailyMarketCap[], calls?: string[]): AxisDeps {
    return {
        minute: { getMinuteCandles: () => Promise.resolve([]) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: () => Promise.resolve([]) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve([]) },
        marketCap: {
            getByDateAndCodes: (date, codes) => {
                calls?.push(`${date}|${[...codes].sort().join(",")}`);
                return Promise.resolve(rows.filter((r) => r.date === date && codes.includes(r.stockCode)));
            },
        },
    };
}

describe("marketCapAxis", () => {
    const axis = marketCapAxis();

    it("값 = 시총(원) → 억원 환산, 행 = 차트", async () => {
        const out = await axis.compute(
            [chart("005930", "2026-07-02")],
            deps([{ stockCode: "005930", date: "2026-07-02", marketCap: "1984800000000000" }]),
        );
        expect(out).toEqual([{ stockCode: "005930", date: "2026-07-02", value: 19848000 }]);
    });

    it("날짜별 배치 1회 — 같은 날 여러 종목이 쿼리 하나로 간다", async () => {
        const calls: string[] = [];
        const out = await axis.compute(
            [chart("A", "2026-07-02"), chart("B", "2026-07-02"), chart("A", "2026-07-03")],
            deps(
                [
                    { stockCode: "A", date: "2026-07-02", marketCap: "300000000000" }, // 3,000억
                    { stockCode: "B", date: "2026-07-02", marketCap: "50000000000" }, // 500억
                    { stockCode: "A", date: "2026-07-03", marketCap: "310000000000" },
                ],
                calls,
            ),
        );
        expect(calls.sort()).toEqual(["2026-07-02|A,B", "2026-07-03|A"]);
        expect(out.map((v) => v.value).sort((a, b) => a - b)).toEqual([500, 3000, 3100]);
    });

    it("미백필 종목·비수치·0 이하는 결손(값을 지어내지 않는다)", async () => {
        const out = await axis.compute(
            [chart("A", "2026-07-02"), chart("B", "2026-07-02"), chart("C", "2026-07-02")],
            deps([
                { stockCode: "A", date: "2026-07-02", marketCap: "0" }, // 재료 오염
                { stockCode: "B", date: "2026-07-02", marketCap: "x" }, // 비수치
                // C: 행 없음(미백필)
            ]),
        );
        expect(out).toEqual([]);
    });
});
