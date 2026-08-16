import { describe, it, expect } from "vitest";
import type { ChartAnchor, DailyCandle, MinuteCandle, ReviewPointKey } from "#domain";
import { baselinePositionAxis } from "../baselinePositionAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02";

const daily = (date: string, un: string, krx: string): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: krx, high: krx, low: krx, close: krx, volume: "1000", amount: "0" },
    un: { open: un, high: un, low: un, close: un, volume: "1000", amount: "0" },
});

const minute = (time: string, close: string, opts: { krx?: string | null; date?: string } = {}): MinuteCandle => ({
    stockCode: CODE,
    date: opts.date ?? DATE,
    time,
    krx: opts.krx === null ? null : { open: opts.krx ?? close, high: opts.krx ?? close, low: opts.krx ?? close, close: opts.krx ?? close, volume: "10" },
    un: { open: close, high: close, low: close, close, volume: "10" },
});

const point = (time: string): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });
/** 차트 소유 기준선(선=앵커) — 타점 시각이 없다. */
const anchorOf = (a: Partial<ChartAnchor>): ChartAnchor =>
    ({ stockCode: CODE, date: DATE, param: "baseline", anchorDate: "2026-07-01", field: "high", market: "un", ...a });

function deps(v: { minutesByDay?: Record<string, MinuteCandle[]>; dailies?: DailyCandle[]; anchors?: ChartAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []), listAnchoredCharts: () => Promise.resolve([]) },
        reviewPoints: { listByChart: () => Promise.resolve([]), listAllPoints: () => Promise.resolve([]) },
    };
}

describe("baselinePositionAxis", () => {
    const axis = baselinePositionAxis();
    const P = point("09:30:00");

    it("일봉 앵커 — 수정주가에서 저장된 시장·값을 분모로, 타점 시각 종가를 분자로", async () => {
        const d = deps({
            minutesByDay: { [DATE]: [minute("09:30:00", "11000")] },
            dailies: [daily("2026-07-01", "10000", "9900")],
            anchors: [anchorOf({ field: "high", market: "un" })],
        });
        const out = await axis.compute([P], d);
        expect(out).toEqual([{ ...P, value: 10 }]); // (11000-10000)/10000
    });

    it("분자는 언제나 UN — KRX 앵커라도 현재가는 UN 에서 읽는다", async () => {
        // 앵커 시장(KRX)을 분자까지 따라갔다면 (10500-10000)/10000 = 5% 가 나온다. UN 분자면 10%.
        const d = deps({
            minutesByDay: { [DATE]: [minute("09:30:00", "11000", { krx: "10500" })] },
            dailies: [daily("2026-07-01", "10500", "10000")],
            anchors: [anchorOf({ field: "high", market: "krx" })],
        });
        const out = await axis.compute([P], d);
        expect(out[0].value).toBe(10); // (11000 UN종가 − 10000 KRX기준선)/10000
    });

    it("분봉 앵커 — 그 분봉의 저장된 값이 분모(다른 날짜의 분봉도 읽는다)", async () => {
        const d = deps({
            minutesByDay: {
                [DATE]: [minute("09:30:00", "10500")],
                "2026-07-01": [minute("13:00:00", "10000", { date: "2026-07-01" })],
            },
            anchors: [anchorOf({ anchorTime: "13:00:00", field: "close", market: "un" })],
        });
        const out = await axis.compute([P], d);
        expect(out[0].value).toBe(5);
    });

    it("앵커 없는 타점은 결손 — 재료(캔들) 읽기 없이 빠진다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.minute = { getMinuteCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axis.compute([P], d)).toEqual([]);
        expect(reads).toBe(0); // 앵커 필터가 읽기보다 먼저
    });

    it("NXT 단독 시간대(KRX 바 없음) 타점도 값이 나온다 — 분자가 UN 이라 세션 결손이 없다", async () => {
        const pre = point("08:30:00");
        const d = deps({
            minutesByDay: { [DATE]: [minute("08:30:00", "11000", { krx: null })] },
            dailies: [daily("2026-07-01", "10500", "10000")],
            anchors: [anchorOf({ field: "high", market: "krx" })],
        });
        const out = await axis.compute([pre], d);
        expect(out[0].value).toBe(10);
    });

    it("앵커 캔들 미수집·기준값 0 은 결손", async () => {
        const noDaily = deps({ minutesByDay: { [DATE]: [minute("09:30:00", "11000")] }, dailies: [], anchors: [anchorOf({})] });
        expect(await axis.compute([P], noDaily)).toEqual([]);

        const zeroBase = deps({
            minutesByDay: { [DATE]: [minute("09:30:00", "11000")] },
            dailies: [daily("2026-07-01", "0", "0")],
            anchors: [anchorOf({})],
        });
        expect(await axis.compute([P], zeroBase)).toEqual([]);
    });

    it("선이 여럿이면 가격 최저가 분모 — 리졸버 규칙이 이 축에도 적용", async () => {
        const d = deps({
            minutesByDay: { [DATE]: [minute("09:30:00", "11000")] },
            dailies: [daily("2026-07-01", "10000", "9900"), daily("2026-06-30", "8800", "8800")],
            anchors: [anchorOf({}), anchorOf({ anchorDate: "2026-06-30" })],
        });
        const out = await axis.compute([P], d);
        expect(out[0].value).toBe(25); // (11000-8800)/8800 — 낮은 선(8800)이 분모
    });
});
