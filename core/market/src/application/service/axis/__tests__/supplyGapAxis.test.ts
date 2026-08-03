import { describe, it, expect } from "vitest";
import { IGNORE_CANDLE_PARAM, type DailyCandle, type MinuteCandle, type PointAnchor, type ReviewPointKey } from "#domain";
import { supplyGapAxis } from "../supplyGapAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02"; // 타점 날 — 일봉 조회 상한
const ANCHOR_DATE = "2026-07-01"; // 기준선 앵커(가격선)가 걸린 캔들

/** 고가만 의미 있는 일봉(나머지 값은 스캔이 안 읽는다). krx 는 UN 과 다르게 둬 "스캔은 언제나 UN"을 드러낸다. */
const daily = (date: string, high: number, krxHigh = 0): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: "0", high: String(krxHigh), low: "0", close: "0", volume: "1000", amount: "0" },
    un: { open: "0", high: String(high), low: "0", close: "0", volume: "1000", amount: "0" },
});

const minute = (date: string, time: string, high: string): MinuteCandle => ({
    stockCode: CODE,
    date,
    time,
    krx: null,
    un: { open: high, high, low: high, close: high, volume: "10" },
});

const point = (time = "09:30:00"): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });
const baseline = (p: ReviewPointKey, a: Partial<PointAnchor> = {}): PointAnchor =>
    ({ ...p, param: "baseline", anchorDate: ANCHOR_DATE, field: "high", market: "un", ...a });
const ignore = (p: ReviewPointKey, anchorDate: string): PointAnchor => ({ ...p, param: IGNORE_CANDLE_PARAM, anchorDate });

function deps(v: { dailies?: DailyCandle[]; minutesByDay?: Record<string, MinuteCandle[]>; anchors?: PointAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        pointAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []) },
    };
}

/**
 * 6/22~7/01 열 거래일. 기준선은 7/01 고가(=100).
 * 왼쪽으로 6/30·6/29·6/26 은 100 아래, 6/25 가 첫 접촉(105).
 */
const HISTORY: DailyCandle[] = [
    daily("2026-06-22", 90),
    daily("2026-06-23", 92),
    daily("2026-06-24", 95),
    daily("2026-06-25", 105), // 접촉 — 기준선 위에서 거래됨
    daily("2026-06-26", 80),
    daily("2026-06-29", 85),
    daily("2026-06-30", 88),
    daily(ANCHOR_DATE, 100),
];

describe("supplyGapAxis", () => {
    const axis = supplyGapAxis();
    const P = point();

    it("앵커 왼쪽으로 첫 접촉(고가 ≥ 기준선)까지의 거래일 수", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(P)] }));
        expect(out).toEqual([{ ...P, value: 3 }]); // 6/30·6/29·6/26 이 비었고 6/25 가 접촉
    });

    it("바로 전 거래일이 이미 기준선 위면 0 — 공백이 없다", async () => {
        const dailies = [...HISTORY.slice(0, 7), daily("2026-06-30", 120), daily(ANCHOR_DATE, 100)];
        const out = await axis.compute([P], deps({ dailies, anchors: [baseline(P)] }));
        expect(out[0].value).toBe(0);
    });

    it("창 안에 접촉이 없으면 훑은 거래일 수 전부 = 포화(역사적 신고가)", async () => {
        const dailies = HISTORY.map((d) => (d.date === "2026-06-25" ? daily("2026-06-25", 70) : d));
        const out = await axis.compute([P], deps({ dailies, anchors: [baseline(P)] }));
        expect(out[0].value).toBe(7); // 앵커 왼쪽 일곱 봉 전부 공백
    });

    it("무시 캔들은 없는 셈 친다 — 접촉도 아니고 공백 일수로도 안 센다", async () => {
        const anchors = [baseline(P), ignore(P, "2026-06-25")];
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors }));
        // 6/25 를 빼면 다음 접촉은 6/24(95)…도 기준선 아래 → 창 끝까지 접촉 없음. 남은 여섯 봉이 전부 공백.
        expect(out[0].value).toBe(6);
    });

    it("무시 캔들은 타점 소유 — 다른 타점의 무시는 이 타점 값에 안 섞인다", async () => {
        const other = point("10:00:00");
        const anchors = [baseline(P), baseline(other), ignore(other, "2026-06-25")];
        const out = await axis.compute([P, other], deps({ dailies: HISTORY, anchors }));
        expect(out.find((v) => v.time === P.time)?.value).toBe(3); // 무시 없음
        expect(out.find((v) => v.time === other.time)?.value).toBe(6); // 무시 반영
    });

    it("스캔은 언제나 UN — KRX 기준선 앵커라도 왼쪽은 UN 고가로 훑는다", async () => {
        // KRX 고가만 보면 6/25 가 60 이라 접촉이 아니고, UN 으로 보면 접촉이다.
        const dailies = HISTORY.map((d) => (d.date === "2026-06-25" ? daily("2026-06-25", 105, 60) : d));
        const withKrxAnchor = [...dailies.slice(0, 7), daily(ANCHOR_DATE, 999, 100)];
        const out = await axis.compute([P], deps({ dailies: withKrxAnchor, anchors: [baseline(P, { market: "krx" })] }));
        expect(out[0].value).toBe(3); // 문턱은 KRX 100, 접촉 판정은 UN 105
    });

    it("분봉 기준선 앵커도 받는다 — 문턱만 분봉에서 꺼내고 스캔은 그대로 일봉", async () => {
        const anchors = [baseline(P, { anchorTime: "13:00:00", field: "close" })];
        const d = deps({ dailies: HISTORY, minutesByDay: { [ANCHOR_DATE]: [minute(ANCHOR_DATE, "13:00:00", "100")] }, anchors });
        expect((await axis.compute([P], d))[0].value).toBe(3);
    });

    it("기준선 없음 · 앵커 캔들 미수집 · 왼쪽 캔들 없음은 결손", async () => {
        expect(await axis.compute([P], deps({ dailies: HISTORY, anchors: [] }))).toEqual([]);

        const noAnchorCandle = deps({ dailies: HISTORY.filter((d) => d.date !== ANCHOR_DATE), anchors: [baseline(P)] });
        expect(await axis.compute([P], noAnchorCandle)).toEqual([]);

        // 앵커가 창의 첫 봉 — 왼쪽에 아무것도 없다. 0(=공백 없음)으로 지어내면 안 된다.
        const onlyAnchor = deps({ dailies: [daily(ANCHOR_DATE, 100)], anchors: [baseline(P)] });
        expect(await axis.compute([P], onlyAnchor)).toEqual([]);
    });

    it("기준선 없는 타점은 캔들 읽기 없이 빠진다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.adjDaily = { getDailyCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axis.compute([P], d)).toEqual([]);
        expect(reads).toBe(0);
    });
});
