import { describe, it, expect } from "vitest";
import { IGNORE_CANDLE_PARAM, type ChartAnchor, type DailyCandle, type MinuteCandle, type ReviewPointKey } from "#domain";
import { supplyGapAxis } from "../supplyGapAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02"; // 타점 날 — 일봉 조회 상한
const ANCHOR_DATE = "2026-07-01"; // 기준선 앵커(선)가 걸린 캔들

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
let seq = 0;
/** 차트 소유 앵커 — 타점 시각이 없다. */
const baseline = (a: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ id: String(++seq), stockCode: CODE, date: DATE, param: "baseline", anchorDate: ANCHOR_DATE, field: "high", market: "un", ...a });
const ignore = (anchorDate: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ id: String(++seq), stockCode: CODE, date: DATE, param: IGNORE_CANDLE_PARAM, anchorDate, ...over });

function deps(v: { dailies?: DailyCandle[]; minutesByDay?: Record<string, MinuteCandle[]>; anchors?: ChartAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []), listAnchoredCharts: () => Promise.resolve([]) },
        reviewPoints: { listByChart: () => Promise.resolve([]), listAllPoints: () => Promise.resolve([]) },
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

/** 6/25 를 무시했을 때 다음 접촉이 있도록 더 왼쪽에 하나 더(6/19). 무시 일수를 세는지 아닌지가 여기서 갈린다. */
const WITH_OLDER_CONTACT: DailyCandle[] = [daily("2026-06-19", 110), ...HISTORY];

describe("supplyGapAxis", () => {
    const axis = supplyGapAxis();
    const P = point();

    it("앵커 왼쪽으로 첫 접촉(고가 ≥ 기준선)까지의 거래일 수", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline()] }));
        expect(out).toEqual([{ ...P, value: 3 }]); // 6/30·6/29·6/26 이 비었고 6/25 가 접촉
    });

    it("바로 전 거래일이 이미 기준선 위면 0 — 공백이 없다", async () => {
        const dailies = [...HISTORY.slice(0, 7), daily("2026-06-30", 120), daily(ANCHOR_DATE, 100)];
        const out = await axis.compute([P], deps({ dailies, anchors: [baseline()] }));
        expect(out[0].value).toBe(0);
    });

    it("창 안에 접촉이 없으면 saturated — 값은 훑은 거래일 수 = 하한(역사적 신고가)", async () => {
        const dailies = HISTORY.map((d) => (d.date === "2026-06-25" ? daily("2026-06-25", 70) : d));
        const out = await axis.compute([P], deps({ dailies, anchors: [baseline()] }));
        expect(out[0]).toEqual({ ...P, value: 7, saturated: true }); // 앵커 왼쪽 일곱 봉을 훑고 못 찾음
    });

    it("왼쪽에 캔들이 하나도 없어도 saturated — 값 0 이 '매물이 바로 옆'으로 읽히지 않게", async () => {
        const onlyAnchor = deps({ dailies: [daily(ANCHOR_DATE, 100)], anchors: [baseline()] });
        expect((await axis.compute([P], onlyAnchor))[0]).toEqual({ ...P, value: 0, saturated: true });
    });

    it("접촉을 찾은 값에는 saturated 가 안 붙는다 — 실측과 절단을 섞지 않는다", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline()] }));
        expect(out[0].saturated).toBeUndefined();
    });

    it("무시 캔들은 접촉이 아닐 뿐 공백 일수로는 센다", async () => {
        const d = (anchors: ChartAnchor[]) => deps({ dailies: WITH_OLDER_CONTACT, anchors });
        expect((await axis.compute([P], d([baseline()])))[0].value).toBe(3); // 6/25 가 접촉

        const out = await axis.compute([P], d([baseline(), ignore("2026-06-25")]));
        // 다음 접촉은 6/19 — 그 사이 6/30·6/29·6/26·[6/25]·6/24·6/23·6/22 일곱 거래일.
        // 무시한 날을 달력에서 지웠다면 6 이 나온다. 접촉을 찾았으니 절단도 아니다.
        expect(out[0]).toEqual({ ...P, value: 7 });
    });

    it("무시 캔들은 차트 소유 — 같은 차트의 모든 타점이 같은 무시 목록을 본다", async () => {
        const other = point("10:00:00");
        const anchors = [baseline(), ignore("2026-06-25")];
        const out = await axis.compute([P, other], deps({ dailies: WITH_OLDER_CONTACT, anchors }));
        expect(out.find((v) => v.time === P.time)?.value).toBe(7);
        expect(out.find((v) => v.time === other.time)?.value).toBe(7);
    });

    it("다른 차트(날짜)의 무시 캔들은 안 샌다 — 소급 오염 방지", async () => {
        const anchors = [baseline(), ignore("2026-06-25", { date: "2026-07-03" })]; // 다른 날짜 차트의 무시
        const out = await axis.compute([P], deps({ dailies: WITH_OLDER_CONTACT, anchors }));
        expect(out[0].value).toBe(3); // 이 차트에는 무시 없음 — 6/25 가 그대로 접촉
    });

    it("스캔은 언제나 UN — KRX 기준선 앵커라도 왼쪽은 UN 고가로 훑는다", async () => {
        // KRX 고가만 보면 6/25 가 60 이라 접촉이 아니고, UN 으로 보면 접촉이다.
        const dailies = HISTORY.map((d) => (d.date === "2026-06-25" ? daily("2026-06-25", 105, 60) : d));
        const withKrxAnchor = [...dailies.slice(0, 7), daily(ANCHOR_DATE, 999, 100)];
        const out = await axis.compute([P], deps({ dailies: withKrxAnchor, anchors: [baseline({ market: "krx" })] }));
        expect(out[0].value).toBe(3); // 문턱은 KRX 100, 접촉 판정은 UN 105
    });

    it("분봉 기준선 앵커도 받는다 — 문턱만 분봉에서 꺼내고 스캔은 그대로 일봉", async () => {
        const anchors = [baseline({ anchorTime: "13:00:00", field: "close" })];
        const d = deps({ dailies: HISTORY, minutesByDay: { [ANCHOR_DATE]: [minute(ANCHOR_DATE, "13:00:00", "100")] }, anchors });
        expect((await axis.compute([P], d))[0].value).toBe(3);
    });

    it("선이 여럿이면 가격 최저가 문턱 — 낮은 선 기준으로 접촉을 찾는다", async () => {
        // 6/30(88)에 낮은 선을 하나 더 — 문턱이 88이 되고, 바로 왼쪽 6/30... 은 앵커 자신이므로
        // 낮은 선의 앵커(6/30) 왼쪽부터: 6/29(85) 비고 6/26(80) 비고 6/25(105) 접촉 → 2.
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(), baseline({ anchorDate: "2026-06-30" })] }));
        expect(out[0].value).toBe(2);
    });

    it("기준선 없음 · 앵커 캔들 미수집은 결손 — 문턱을 모르면 잴 것이 없다", async () => {
        expect(await axis.compute([P], deps({ dailies: HISTORY, anchors: [] }))).toEqual([]);

        const noAnchorCandle = deps({ dailies: HISTORY.filter((d) => d.date !== ANCHOR_DATE), anchors: [baseline()] });
        expect(await axis.compute([P], noAnchorCandle)).toEqual([]);
    });

    it("기준선 없는 타점은 캔들 읽기 없이 빠진다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.adjDaily = { getDailyCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axis.compute([P], d)).toEqual([]);
        expect(reads).toBe(0);
    });
});
