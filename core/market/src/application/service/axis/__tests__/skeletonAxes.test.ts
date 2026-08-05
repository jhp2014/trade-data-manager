import { describe, it, expect } from "vitest";
import type { ChartAnchor, DailyCandle, MinuteCandle, ReviewPointKey } from "#domain";
import { SKELETON_AXES, SKELETON_SHAPE_VERSION } from "../skeletonAxes.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02";

const daily = (date: string, price: number): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: String(price), high: String(price), low: String(price), close: String(price), volume: "1000", amount: "0" },
    un: { open: String(price), high: String(price), low: String(price), close: String(price), volume: "1000", amount: "0" },
});

const point = (time = "09:30:00"): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });
let seq = 0;
/** 차트 소유 골격 피벗 — 타점 시각 없음. */
const pivot = (anchorDate: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ id: String(++seq), stockCode: CODE, date: DATE, param: "skeleton", anchorDate, field: "high", market: "un", ...over });

function deps(v: { dailies?: DailyCandle[]; minutesByDay?: Record<string, MinuteCandle[]>; anchors?: ChartAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []), listAnchoredCharts: () => Promise.resolve([]) },
    };
}

const axisOf = (key: string) => SKELETON_AXES.find((a) => a.key === key)!;
/** 6/22~7/01 여덟 거래일 — dayIndex 는 이 창 안 순번. */
const HISTORY = [
    daily("2026-06-22", 10000),
    daily("2026-06-23", 10500),
    daily("2026-06-24", 12000), // idx 2 — P2 고점
    daily("2026-06-25", 11500),
    daily("2026-06-26", 11000), // idx 4 — P3 골
    daily("2026-06-29", 11400),
    daily("2026-06-30", 11800),
    daily("2026-07-01", 11900),
];

describe("골격 파생 축", () => {
    it("네 축이 한 골격에서 각자 다른 숫자를 고른다", async () => {
        const P = point();
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24"), pivot("2026-06-26", { field: "close" })];
        const d = deps({ dailies: HISTORY, anchors });

        expect((await axisOf("skeleton-base-rise").compute([P], d))[0].value).toBeCloseTo(20, 0); // (12000-10000)/10000
        expect((await axisOf("skeleton-base-days").compute([P], d))[0].value).toBe(2); // idx 0 → 2
        expect((await axisOf("skeleton-base-slope").compute([P], d))[0].value).toBeCloseTo(10, 0); // 20% / 2일
        expect((await axisOf("skeleton-pullback").compute([P], d))[0].value).toBeCloseTo(50, 0); // (12000-11000)/2000
    });

    it("골격 미입력 차트는 축에서 빠진다(입력 전) — 캔들 읽기도 없다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.adjDaily = { getDailyCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
        expect(reads).toBe(0);
    });

    it("피벗이 하나면 골격이 아니다 — 통째 결손(반쪽 형태를 지어내지 않는다)", async () => {
        const d = deps({ dailies: HISTORY, anchors: [pivot("2026-06-24")] });
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
    });

    it("피벗 하나라도 창 밖·미수집이면 그 골격 통째 결손 — 뺀 모양은 찍은 모양이 아니다", async () => {
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24"), pivot("2020-01-05")]; // 창 밖
        const d = deps({ dailies: HISTORY, anchors });
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
    });

    it("차트 소유 — 같은 차트의 두 타점이 같은 골격 값을 받는다", async () => {
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24")];
        const out = await axisOf("skeleton-base-rise").compute([point("09:30:00"), point("14:00:00")], deps({ dailies: HISTORY, anchors }));
        expect(out.map((v) => v.value)).toEqual([20, 20]);
    });

    it("다른 차트(날짜)의 골격은 안 샌다", async () => {
        const anchors = [pivot("2026-06-22", { field: "open", date: "2026-07-03" }), pivot("2026-06-24", { date: "2026-07-03" })];
        expect(await axisOf("skeleton-base-rise").compute([point()], deps({ dailies: HISTORY, anchors }))).toEqual([]);
    });

    it("기울기만 결손인 골격도 나머지 축은 값을 낸다 — 축별 독립 결손", async () => {
        // 한 캔들 안 상승(시→고) = 거래일 0 → 기울기 결손, 크기·기간·되돌림은 정상.
        const anchors = [pivot("2026-06-24", { field: "open" }), pivot("2026-06-24"), pivot("2026-06-26", { field: "close" })];
        const d = deps({ dailies: HISTORY, anchors });
        expect(await axisOf("skeleton-base-slope").compute([point()], d)).toEqual([]);
        expect((await axisOf("skeleton-base-days").compute([point()], d))[0].value).toBe(0);
    });

    it("축 version 은 형태층 버전을 품는다 — 형태 계산을 고치면 전 축이 함께 무효화", () => {
        for (const a of SKELETON_AXES) expect(Math.floor(a.version / 100)).toBe(SKELETON_SHAPE_VERSION);
    });

    it("모든 골격 축은 skeleton 파라미터를 필수로 선언한다(결손 분모가 골격 있는 차트로 좁혀진다)", () => {
        for (const a of SKELETON_AXES) expect(a.params).toEqual(["skeleton"]);
    });
});
