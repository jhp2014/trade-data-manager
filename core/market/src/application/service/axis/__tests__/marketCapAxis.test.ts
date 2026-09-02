import { describe, expect, it } from "vitest";
import type { ChartRef, DailyMarketCap } from "#domain";
import { marketCapAxis } from "../marketCapAxis.js";
import type { AxisDeps } from "../axis.js";

const chart = (stockCode: string, date: string): ChartRef => ({ stockCode, date });

/**
 * 테이블을 흉내내는 가짜 리더 — 축이 **직전 거래일 행**을 읽는다는 계약을 그대로 재현한다.
 * (종목별 date 미만 최신 1행. 실제 구현의 DISTINCT ON 과 같은 뜻.)
 */
function deps(rows: DailyMarketCap[], calls?: string[]): AxisDeps {
    return {
        minute: { getMinuteCandles: () => Promise.resolve([]) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: () => Promise.resolve([]) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve([]) },
        marketCap: {
            getPreviousByDateAndCodes: (date, codes) => {
                calls?.push(`${date}|${[...codes].sort().join(",")}`);
                const out: DailyMarketCap[] = [];
                for (const code of codes) {
                    const prior = rows
                        .filter((r) => r.stockCode === code && r.date < date)
                        .sort((a, b) => b.date.localeCompare(a.date))[0];
                    if (prior) out.push(prior);
                }
                return Promise.resolve(out);
            },
        },
    };
}

describe("marketCapAxis", () => {
    const axis = marketCapAxis();

    it("직전 거래일 시총을 차트 날짜 칸에 싣는다(억원 환산)", async () => {
        const out = await axis.compute(
            [chart("005930", "2026-07-02")],
            deps([
                { stockCode: "005930", date: "2026-07-01", marketCap: "1984800000000000" }, // D-1 = 읽을 값
                { stockCode: "005930", date: "2026-07-02", marketCap: "9999999999999999" }, // 당일 = 무시돼야
            ]),
        );
        expect(out).toEqual([{ stockCode: "005930", date: "2026-07-02", value: 19848000 }]);
    });

    it("직전 거래일은 달력 하루 전이 아니다 — 연휴·거래정지를 건너뛴다", async () => {
        const out = await axis.compute(
            [chart("A", "2026-07-06")], // 월요일. 직전 거래일은 7/03(금)
            deps([{ stockCode: "A", date: "2026-07-03", marketCap: "300000000000" }]),
        );
        expect(out).toEqual([{ stockCode: "A", date: "2026-07-06", value: 3000 }]);
    });

    it("날짜별 배치 1회 — 같은 날 여러 종목이 쿼리 하나로 간다", async () => {
        const calls: string[] = [];
        const out = await axis.compute(
            [chart("A", "2026-07-02"), chart("B", "2026-07-02"), chart("A", "2026-07-03")],
            deps(
                [
                    { stockCode: "A", date: "2026-07-01", marketCap: "300000000000" }, // 3,000억
                    { stockCode: "B", date: "2026-07-01", marketCap: "50000000000" }, // 500억
                    { stockCode: "A", date: "2026-07-02", marketCap: "310000000000" },
                ],
                calls,
            ),
        );
        expect(calls.sort()).toEqual(["2026-07-02|A,B", "2026-07-03|A"]);
        expect(out.map((v) => v.value).sort((a, b) => a - b)).toEqual([500, 3000, 3100]);
    });

    it("직전 행 없음·비수치·0 이하는 결손(값을 지어내지 않는다)", async () => {
        const out = await axis.compute(
            [chart("A", "2026-07-02"), chart("B", "2026-07-02"), chart("C", "2026-07-02")],
            deps([
                { stockCode: "A", date: "2026-07-01", marketCap: "0" }, // 재료 오염
                { stockCode: "B", date: "2026-07-01", marketCap: "x" }, // 비수치
                // C: 직전 행 없음(상장 첫날)
            ]),
        );
        expect(out).toEqual([]);
    });
});
