import { describe, it, expect } from "vitest";
import type { DailyCandle, MinuteCandle, ReviewPointKey } from "#domain";
import { dailyChangeAxis } from "../dailyChangeAxis.js";
import type { AxisDeps } from "../axis.js";

// 원주가·수정주가가 같은 평상일 일봉(감자·액분 없음 → basePricesOf factor 1 → base = 직전 종가).
const daily = (date: string, close: string): DailyCandle => ({
    stockCode: "005930",
    date,
    krx: { open: close, high: close, low: close, close, volume: "1000", amount: "0" },
    un: { open: close, high: close, low: close, close, volume: "1000", amount: "0" },
});

const minute = (time: string, close: string, opts: { krx?: boolean } = {}): MinuteCandle => ({
    stockCode: "005930",
    date: "2026-07-02",
    time,
    krx: opts.krx === false ? null : { open: close, high: close, low: close, close, volume: "10" },
    un: { open: close, high: close, low: close, close, volume: "10" },
});

function deps(minutes: MinuteCandle[], dailies: DailyCandle[]): AxisDeps {
    return {
        minute: { getMinuteCandles: () => Promise.resolve(minutes) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve(dailies) },
        adjDaily: { getDailyCandles: () => Promise.resolve(dailies) },
    };
}

const point = (time: string): ReviewPointKey => ({ stockCode: "005930", date: "2026-07-02", time });

// 전일 종가 10000 → 11000 이면 +10%.
const PREV = daily("2026-07-01", "10000");
const TODAY = daily("2026-07-02", "11000");

describe("dailyChangeAxis", () => {
    const axis = dailyChangeAxis("un");

    it("타점 시각의 분봉 종가를 전일 종가 대비 %로 낸다", async () => {
        const d = deps([minute("09:00:00", "10500"), minute("09:01:00", "11000")], [PREV, TODAY]);
        const out = await axis.compute([point("09:01:00")], d);
        expect(out).toEqual([{ stockCode: "005930", date: "2026-07-02", time: "09:01:00", value: 10 }]);
    });

    it("그 시각에 바가 없으면 직전 바를 쓴다(forward fill)", async () => {
        const d = deps([minute("09:00:00", "10500"), minute("09:05:00", "11000")], [PREV, TODAY]);
        const out = await axis.compute([point("09:03:00")], d);
        expect(out[0].value).toBe(5); // 09:00 바(10500) — 09:05 를 미리 보지 않는다
    });

    it("타점이 첫 분봉보다 이르면 결손(결과에서 빠진다)", async () => {
        const d = deps([minute("09:00:00", "10500")], [PREV, TODAY]);
        expect(await axis.compute([point("08:30:00")], d)).toEqual([]);
    });

    it("분봉이 없으면 결손", async () => {
        expect(await axis.compute([point("09:01:00")], deps([], [PREV, TODAY]))).toEqual([]);
    });

    it("기준가가 없으면(직전 일봉 부재) 당일 첫 시가로 폴백 — 차트 D선과 같은 규칙", async () => {
        const d = deps([minute("09:00:00", "10000"), minute("09:01:00", "10500")], [TODAY]);
        const out = await axis.compute([point("09:01:00")], d);
        expect(out[0].value).toBe(5); // 첫 시가 10000 기준
    });

    it("KRX 축은 KRX 바가 없는 시각(NXT 단독)에서 결손", async () => {
        const krxAxis = dailyChangeAxis("krx");
        const d = deps([minute("08:30:00", "10500", { krx: false }), minute("09:00:00", "11000")], [PREV, TODAY]);
        const out = await krxAxis.compute([point("08:40:00"), point("09:00:00")], d);
        expect(out.map((o) => o.time)).toEqual(["09:00:00"]); // 프리마켓 타점은 빠지고 정규장 타점만
    });

    it("같은 (종목,날)의 타점 여러 건을 한 번의 읽기로 처리한다", async () => {
        let reads = 0;
        const minutes = [minute("09:00:00", "10500"), minute("09:01:00", "11000")];
        const d: AxisDeps = {
            minute: { getMinuteCandles: () => { reads++; return Promise.resolve(minutes); } },
            rawDaily: { getRawDailyCandles: () => Promise.resolve([PREV, TODAY]) },
            adjDaily: { getDailyCandles: () => Promise.resolve([PREV, TODAY]) },
        };
        const out = await axis.compute([point("09:00:00"), point("09:01:00")], d);
        expect(out.map((o) => o.value)).toEqual([5, 10]);
        expect(reads).toBe(1);
    });
});
