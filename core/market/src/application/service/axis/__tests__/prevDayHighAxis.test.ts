import { describe, it, expect } from "vitest";
import type { ChartRef, DailyCandle } from "#domain";
import { prevDayHighAxis } from "../prevDayHighAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02"; // 차트 날 — 값은 그 **전날**에서 나온다

interface Bar {
    high?: number;
    close?: number;
}

/** 시장별로 다르게 줄 수 있는 일봉 한 줄. 안 준 시장은 같은 값(대부분의 테스트가 시장 차이에 관심 없다). */
const daily = (date: string, krx: Bar, un: Bar = krx): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: bar(krx),
    un: bar(un),
});
const bar = (b: Bar): DailyCandle["krx"] => ({
    open: "0",
    high: String(b.high ?? 0),
    low: "0",
    close: String(b.close ?? 0),
    volume: "0",
    amount: "0",
});

const chart = (): ChartRef => ({ stockCode: CODE, date: DATE });

/** raw 만 주면 adj = raw(이벤트 없음 = 보정계수 1). 감자 테스트만 둘을 갈라 준다. */
function deps(raw: DailyCandle[], adj: DailyCandle[] = raw): AxisDeps {
    const within = (rows: DailyCandle[], range: { from: string; to: string }): DailyCandle[] =>
        rows.filter((d) => d.date >= range.from && d.date <= range.to);
    return {
        minute: { getMinuteCandles: () => Promise.resolve([]) },
        rawDaily: { getRawDailyCandles: (_c, range) => Promise.resolve(within(raw, range)) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve(within(adj, range)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve([]) },
    };
}

describe("prevDayHighAxis", () => {
    const un = prevDayHighAxis("un");
    const krx = prevDayHighAxis("krx");
    const P = chart();

    it("전일 고가를 전전일 종가로 잰다 — 당일 봉은 값에 안 들어간다", async () => {
        const rows = [
            daily("2026-06-30", { high: 10500, close: 10000 }),
            daily("2026-07-01", { high: 12000, close: 11000 }), // 전일 — 고가 12000
            daily(DATE, { high: 99999, close: 99999 }), // 당일 — 무시돼야 한다
        ];
        const out = await un.compute([P], deps(rows));
        expect(out).toEqual([{ ...P, value: 20 }]); // (12000−10000)/10000
    });

    it("직전 거래일을 날짜로 고른다 — 주말·연휴는 저절로 건너뛴다", async () => {
        // 6/29(월)이 없는 달력: 전일 = 6/26(금), 그 기준가 = 6/25(목) 종가.
        const rows = [
            daily("2026-06-25", { high: 5200, close: 5000 }),
            daily("2026-06-26", { high: 5500, close: 5100 }),
            daily(DATE, { high: 9000, close: 9000 }),
        ];
        const out = await un.compute([P], deps(rows));
        expect(out[0].value).toBe(10); // (5500−5000)/5000
    });

    it("그 시장 고가가 0 이면 결손 — 일봉은 KRX 부재를 null 이 아니라 0 으로 준다(−100% 방지)", async () => {
        const rows = [
            daily("2026-06-30", { high: 0, close: 0 }, { high: 10500, close: 10000 }),
            daily("2026-07-01", { high: 0, close: 0 }, { high: 12000, close: 11000 }),
        ];
        expect(await krx.compute([P], deps(rows))).toEqual([]);
        expect((await un.compute([P], deps(rows)))[0].value).toBe(20); // 같은 재료로 UN 은 나온다
    });

    it("KRX·UN 고가가 갈리는 날 두 축은 서로 다른 값을 낸다 — 축을 둘로 나눈 이유", async () => {
        const rows = [
            daily("2026-06-30", { high: 10500, close: 10000 }),
            // NXT 단독 시간대(프리마켓·시간외)에 더 높이 간 하루 — UN ⊇ KRX
            daily("2026-07-01", { high: 11000, close: 10800 }, { high: 12000, close: 10800 }),
        ];
        expect((await krx.compute([P], deps(rows)))[0].value).toBe(10);
        expect((await un.compute([P], deps(rows)))[0].value).toBe(20);
    });

    it("전일이 없으면 결손 — 상장 첫날·장기 거래정지(창 밖)", async () => {
        const out = await un.compute([P], deps([daily(DATE, { high: 9000, close: 9000 })]));
        expect(out).toEqual([]);
    });

    it("전전일이 없으면(기준가 없음) 결손 — 0% 로 지어내지 않는다", async () => {
        const rows = [daily("2026-07-01", { high: 12000, close: 11000 }), daily(DATE, { high: 9000, close: 9000 })];
        expect(await un.compute([P], deps(rows))).toEqual([]);
    });

    it("감자·액분은 기준가에 보정계수가 걸린다 — 차트 D 선과 같은 분모", async () => {
        // 7/01 아침 1:2 감자: 원주가 6/30 종가 10000 ↔ 수정주가 5000(계수 0.5).
        const raw = [
            daily("2026-06-30", { high: 10400, close: 10000 }),
            daily("2026-07-01", { high: 5500, close: 5100 }),
        ];
        const adj = [
            daily("2026-06-30", { high: 5200, close: 5000 }),
            daily("2026-07-01", { high: 5500, close: 5100 }),
        ];
        const out = await un.compute([P], deps(raw, adj));
        // 보정 안 하면 (5500−10000)/10000 = −45% 라는 가짜 폭락이 나온다.
        expect(out[0].value).toBe(10); // (5500−5000)/5000
    });

    it("차트 여럿을 한 번에 — 값 없는 차트는 배열에서 빠진다(null 을 싣지 않는다)", async () => {
        const rows = [
            daily("2026-06-30", { high: 10500, close: 10000 }),
            daily("2026-07-01", { high: 12000, close: 11000 }),
        ];
        const other: ChartRef = { stockCode: CODE, date: "2026-06-30" }; // 이 차트엔 전전일이 없다
        const out = await un.compute([P, other], deps(rows));
        expect(out).toEqual([{ ...P, value: 20 }]);
    });
});
