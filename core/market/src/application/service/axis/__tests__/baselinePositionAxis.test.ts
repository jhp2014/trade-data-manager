import { describe, it, expect } from "vitest";
import type { DailyCandle, MinuteCandle, PointAnchor, ReviewPointKey } from "#domain";
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
const anchorOf = (p: ReviewPointKey, a: Partial<PointAnchor>): PointAnchor => ({ ...p, param: "baseline", anchorDate: "2026-07-01", ...a });

function deps(v: { minutesByDay?: Record<string, MinuteCandle[]>; dailies?: DailyCandle[]; anchors?: PointAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        pointAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []) },
    };
}

describe("baselinePositionAxis", () => {
    const axis = baselinePositionAxis();
    const P = point("09:30:00");

    it("일봉 앵커 — 수정주가에서 저장된 시장·값을 분모로, 타점 시각 종가를 분자로", async () => {
        const d = deps({
            minutesByDay: { [DATE]: [minute("09:30:00", "11000")] },
            dailies: [daily("2026-07-01", "10000", "9900")],
            anchors: [anchorOf(P, { field: "high", market: "un" })],
        });
        const out = await axis.compute([P], d);
        expect(out).toEqual([{ ...P, value: 10 }]); // (11000-10000)/10000
    });

    it("분자도 앵커의 시장을 쓴다 — KRX 앵커면 분자·분모 둘 다 KRX", async () => {
        const d = deps({
            minutesByDay: { [DATE]: [minute("09:30:00", "11000", { krx: "10890" })] },
            dailies: [daily("2026-07-01", "10000", "9900")],
            anchors: [anchorOf(P, { field: "high", market: "krx" })],
        });
        const out = await axis.compute([P], d);
        expect(out[0].value).toBe(10); // (10890-9900)/9900 — UN 값(11000/10000)이 섞이면 10 이 아니다
    });

    it("분봉 앵커 — 그 분봉의 저장된 값이 분모(다른 날짜의 분봉도 읽는다)", async () => {
        const d = deps({
            minutesByDay: {
                [DATE]: [minute("09:30:00", "10500")],
                "2026-07-01": [minute("13:00:00", "10000", { date: "2026-07-01" })],
            },
            anchors: [anchorOf(P, { anchorTime: "13:00:00", field: "close", market: "un" })],
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

    it("앵커 캔들 미수집·프리마켓 KRX 부재는 결손", async () => {
        // 일봉 앵커인데 그 날짜 수정주가 없음
        const noDaily = deps({ minutesByDay: { [DATE]: [minute("09:30:00", "11000")] }, dailies: [], anchors: [anchorOf(P, { field: "high", market: "un" })] });
        expect(await axis.compute([P], noDaily)).toEqual([]);
        // KRX 앵커인데 타점 시각까지 KRX 바가 없음(NXT 프리마켓 타점)
        const pre = point("08:30:00");
        const noKrx = deps({
            minutesByDay: { [DATE]: [minute("08:30:00", "11000", { krx: null })] },
            dailies: [daily("2026-07-01", "10000", "9900")],
            anchors: [anchorOf(pre, { field: "high", market: "krx" })],
        });
        expect(await axis.compute([pre], noKrx)).toEqual([]);
    });
});
