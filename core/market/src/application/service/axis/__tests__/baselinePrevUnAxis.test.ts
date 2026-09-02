import { describe, expect, it } from "vitest";
import type { ChartAnchor, ChartRef, DailyCandle, MinuteCandle } from "#domain";
import { baselinePrevUnAxis } from "../baselinePrevUnAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02"; // 차트 날 — 분모(그날 기준가)는 그 **전날** 종가에서 나온다

/** high·close 만 뜻이 있는 일봉(krx 는 0 으로 — 이 축은 UN 만 본다). */
const daily = (date: string, high: number, close = high): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: "0", high: "0", low: "0", close: "0", volume: "0", amount: "0" },
    un: { open: String(close), high: String(high), low: String(close), close: String(close), volume: "0", amount: "0" },
});

const anchor = (anchorDate: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ stockCode: CODE, date: DATE, param: "baseline", anchorDate, field: "high", market: "un", ...over });

const minute = (time: string, high: number): MinuteCandle => ({
    stockCode: CODE,
    date: "2026-07-01",
    time,
    krx: null,
    un: { open: String(high), high: String(high), low: String(high), close: String(high), volume: "1" },
});

function deps(v: { raw?: DailyCandle[]; adj?: DailyCandle[]; minutesByDay?: Record<string, MinuteCandle[]>; anchors?: ChartAnchor[] }): AxisDeps {
    const within = (rows: DailyCandle[] | undefined, range: { from: string; to: string }): DailyCandle[] =>
        (rows ?? []).filter((d) => d.date >= range.from && d.date <= range.to);
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: (_c, range) => Promise.resolve(within(v.raw ?? v.adj, range)) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve(within(v.adj, range)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []) },
        marketCap: { getPreviousByDateAndCodes: () => Promise.resolve([]) },
    };
}

const P: ChartRef = { stockCode: CODE, date: DATE };

describe("baselinePrevUnAxis", () => {
    const axis = baselinePrevUnAxis();

    it("값 = (기준선 − 전일 UN 종가) / 전일 UN 종가 × 100 — 위면 +, 아래면 −", async () => {
        // 전일(7/01) 종가 10,000. 기준선 = 6/30 고가.
        const history = [daily("2026-06-30", 11000, 9800), daily("2026-07-01", 10200, 10000), daily(DATE, 10100)];
        const up = await axis.compute([P], deps({ adj: history, anchors: [anchor("2026-06-30")] }));
        expect(up).toEqual([{ stockCode: CODE, date: DATE, value: 10 }]); // (11000−10000)/10000

        const down = await axis.compute([P], deps({ adj: history, anchors: [anchor("2026-07-01")] })); // 고가 10,200
        expect(down[0].value).toBeCloseTo(2, 10);
    });

    it("기준선 없음(입력 전)·당일 앵커만 있음 → 결손", async () => {
        const history = [daily("2026-07-01", 10200, 10000), daily(DATE, 10100)];
        expect(await axis.compute([P], deps({ adj: history }))).toEqual([]);
        // 당일 캔들 기준선은 day 절단선(dropSameDayAnchors)이 거른다 — 다른 앵커 축들과 같은 후보 집합.
        expect(await axis.compute([P], deps({ adj: history, anchors: [anchor(DATE)] }))).toEqual([]);
    });

    it("전일 종가 없음(상장 첫날·창 밖) 또는 앵커 캔들 미수집 → 결손", async () => {
        // 전일 봉이 아예 없다 — 분모를 지어내지 않는다.
        expect(await axis.compute([P], deps({ adj: [daily(DATE, 10100)], anchors: [anchor("2026-06-30")] }))).toEqual([]);
        // 앵커 캔들(6/30)이 미수집 — 분자를 지어내지 않는다.
        const noAnchorBar = [daily("2026-07-01", 10200, 10000), daily(DATE, 10100)];
        expect(await axis.compute([P], deps({ adj: noAnchorBar, anchors: [anchor("2026-06-30")] }))).toEqual([]);
    });

    it("이벤트(액분) 낀 차트 — 수정주가 앵커 값을 그 날 원주가 자로 되돌려 분모와 같은 자에 놓는다", async () => {
        // 차트일 뒤의 5:1 분할로 수정주가가 ÷5 재작성된 상태: raw 10,000 ↔ adj 2,000 (환산비 5).
        const raw = [daily("2026-07-01", 11000, 10000), daily(DATE, 10000)];
        const adj = [daily("2026-07-01", 2200, 2000), daily(DATE, 2000)];
        const out = await axis.compute([P], deps({ raw, adj, anchors: [anchor("2026-07-01")] }));
        // 앵커 고가(수정주가) 2,200 × 환산비 5 = 11,000(원주가) · 분모 = 전일 원주가 종가 10,000 → +10%.
        // 환산을 빼먹으면 (2200−10000)/10000 = −78% 로 폭주 — 이 케이스가 그 회귀의 그물이다.
        expect(out).toEqual([{ stockCode: CODE, date: DATE, value: 10 }]);
    });

    it("분봉 앵커 — 그 분봉 값(원주가)을 앵커 날 환산비로 수정주가에 놓고 다시 차트 날 자로", async () => {
        // 이벤트 없음(환산비 1) — 분봉 고가 10,500 이 그대로 기준선. 전일 종가 10,000 → +5%.
        const history = [daily("2026-07-01", 10200, 10000), daily(DATE, 10100)];
        const out = await axis.compute(
            [P],
            deps({
                adj: history,
                minutesByDay: { "2026-07-01": [minute("10:00:00", 10500)] },
                anchors: [anchor("2026-07-01", { anchorTime: "10:00:00" })],
            }),
        );
        expect(out).toEqual([{ stockCode: CODE, date: DATE, value: 5 }]);
    });
});
