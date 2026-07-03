import { describe, it, expect } from "vitest";
import { ChartReadService } from "../chartReadService.js";
import type { DailyCandle, MinuteCandle, DateRange } from "#domain";

const dailyBar = (v: string) => ({ open: v, high: v, low: v, close: v, volume: "1", amount: "1" });
const daily = (stockCode: string, date: string): DailyCandle => ({
    stockCode,
    date,
    krx: dailyBar("1"),
    un: dailyBar("1"),
});
const minuteBar = (v: string) => ({ open: v, high: v, low: v, close: v, volume: "1" });
const minute = (stockCode: string, time: string): MinuteCandle => ({
    stockCode,
    date: "2026-06-26",
    time,
    krx: minuteBar("1"),
    un: minuteBar("1"),
});

interface Data {
    dailyByCode?: Record<string, DailyCandle[]>;
    minuteByCode?: Record<string, MinuteCandle[]>;
    rawBaseByCode?: Record<string, { krxClose: string; unClose: string }>;
}

function service(d: Data) {
    const ranges: Record<string, DateRange> = {};
    const svc = new ChartReadService({
        dailyCandle: {
            getDailyCandles: async (code, range) => {
                ranges[code] = range;
                return d.dailyByCode?.[code] ?? [];
            },
            getDailyCandle: async () => null,
            saveDailyCandles: async () => {},
            getEarliestDailyDate: async () => null,
        },
        minuteCandle: {
            getMinuteCandles: async (code) => d.minuteByCode?.[code] ?? [],
            saveMinuteCandles: async () => {},
            hasMinuteCandlesOnDate: async () => false,
            deleteMinuteCandlesOnDate: async () => 0,
        },
        rawDailyCandle: {
            getPreviousRawClose: async (code) => d.rawBaseByCode?.[code] ?? null,
            saveRawDailyCandles: async () => {},
            getRawDailyCandles: async () => [],
            getEarliestRawDailyDate: async () => null,
        },
    });
    return { svc, ranges };
}

const date = "2026-06-26";

describe("ChartReadService", () => {
    it("일봉은 [date−2년, date] 범위로 조회", async () => {
        const { svc, ranges } = service({ dailyByCode: { "005930": [daily("005930", date)] } });
        await svc.chartByCode("005930", date);
        expect(ranges["005930"]).toEqual({ from: "2024-06-26", to: date });
    });

    it("분봉은 densify 로 내부갭이 채워진 dense 시계열", async () => {
        // 09:00, 09:03 두 봉 → 사이 09:01·09:02 flat-fill(vol 0)
        const { svc } = service({
            minuteByCode: { "005930": [minute("005930", "09:00:00"), minute("005930", "09:03:00")] },
        });
        const bundle = await svc.chartByCode("005930", date);
        expect(bundle.minutes.map((m) => m.time)).toEqual([
            "09:00:00",
            "09:01:00",
            "09:02:00",
            "09:03:00",
        ]);
        expect(bundle.minutes[1].un.volume).toBe("0"); // 채움봉
    });

    it("rawBase = 직전 거래일 원주가 종가 스칼라를 번들에 실어준다(없으면 null)", async () => {
        const { svc } = service({ rawBaseByCode: { "005930": { krxClose: "329000", unClose: "329500" } } });
        const bundle = await svc.chartByCode("005930", date);
        expect(bundle.rawBase).toEqual({ krxClose: "329000", unClose: "329500" });
        // 원주가 일봉 없는 종목(상장 첫날 등) → null
        const empty = await svc.chartByCode("999999", date);
        expect(empty.rawBase).toBeNull();
    });

    it("chartsByCodes 는 입력 코드 순서 유지, 데이터 없는 코드는 빈 배열", async () => {
        const { svc } = service({ dailyByCode: { "005930": [daily("005930", date)] } });
        const bundles = await svc.chartsByCodes(["005930", "999999"], date);
        expect(bundles.map((b) => b.stockCode)).toEqual(["005930", "999999"]);
        expect(bundles[0].daily).toHaveLength(1);
        expect(bundles[1].daily).toEqual([]);
        expect(bundles[1].minutes).toEqual([]);
    });
});
