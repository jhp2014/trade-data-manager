// makeChartByCode 의 조립만 본다(core 순수함수의 계산은 core 테스트 몫) — 빈 데이터에서 basePrice 가
// null 로 접히고(rawScale 은 1 폴백), 읽기 3개가 코드·날짜/범위를 그대로 받는지.
import { describe, expect, it } from "vitest";
import { chartDailyRange, subtractMonths, RAW_DAILY_LOOKBACK_MONTHS } from "@trade-data-manager/market";
import { makeChartByCode } from "./chart.js";

describe("makeChartByCode", () => {
    it("빈 데이터 — daily·minutes 빈 배열, basePrice null(krx·un 둘 다 null), rawScale 1 폴백", async () => {
        const seen: unknown[] = [];
        const chartByCode = makeChartByCode({
            dailyCandle: {
                getDailyCandles: async (code, range) => {
                    seen.push(["daily", code, range]);
                    return [];
                },
            },
            minuteCandle: {
                getMinuteCandles: async (code, date) => {
                    seen.push(["minute", code, date]);
                    return [];
                },
            },
            rawDailyCandle: {
                getRawDailyCandles: async (code, range) => {
                    seen.push(["raw", code, range]);
                    return [];
                },
            },
        });
        const bundle = await chartByCode("000001", "2025-01-02");
        expect(bundle).toEqual({ stockCode: "000001", daily: [], minutes: [], basePrice: null, rawScale: 1 });
        expect(seen).toContainEqual(["daily", "000001", chartDailyRange("2025-01-02")]);
        expect(seen).toContainEqual(["minute", "000001", "2025-01-02"]);
        expect(seen).toContainEqual([
            "raw",
            "000001",
            { from: subtractMonths("2025-01-02", RAW_DAILY_LOOKBACK_MONTHS), to: "2025-01-02" },
        ]);
    });
});
