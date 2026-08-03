import { describe, it, expect } from "vitest";
import type { DailyCandle, PointAnchor, ReviewPointKey } from "#domain";
import { baselineDistanceAxis } from "../baselineDistanceAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02"; // 타점 날 = 창의 상한

/** 이 축은 값이 아니라 좌표만 읽는다 — OHLC 는 아무 값이나 둔다. */
const daily = (date: string): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: "0", high: "0", low: "0", close: "0", volume: "0", amount: "0" },
    un: { open: "0", high: "0", low: "0", close: "0", volume: "0", amount: "0" },
});

const point = (time = "09:30:00"): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });
const baseline = (p: ReviewPointKey, anchorDate: string, anchorTime?: string): PointAnchor =>
    ({ ...p, param: "baseline", anchorDate, anchorTime, field: "high", market: "un" });

function deps(v: { dailies?: DailyCandle[]; anchors?: PointAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: () => Promise.resolve([]) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        pointAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []) },
    };
}

/** 6/22 ~ 7/02 여덟 거래일(주말 제외). 타점은 7/02. */
const HISTORY = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-29", "2026-06-30", "2026-07-01", DATE].map(daily);

describe("baselineDistanceAxis", () => {
    const axis = baselineDistanceAxis();
    const P = point();

    it("앵커 다음 거래일부터 타점 날까지의 거래일 수", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(P, "2026-06-29")] }));
        expect(out).toEqual([{ ...P, value: 3 }]); // 6/30 · 7/01 · 7/02
    });

    it("주말은 안 센다 — 달력일이 아니라 거래일", async () => {
        // 6/26(금) → 7/02 는 달력으로 6일, 거래일로는 4일(6/29·6/30·7/01·7/02).
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(P, "2026-06-26")] }));
        expect(out[0].value).toBe(4);
    });

    it("같은 날 앵커(분봉 기준선)는 0", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(P, DATE, "13:00:00")] }));
        expect(out[0].value).toBe(0);
    });

    it("앵커 날에 봉이 없어도(거래정지) 그 뒤 거래일로 센다", async () => {
        const gapped = HISTORY.filter((d) => d.date !== "2026-06-29");
        const out = await axis.compute([P], deps({ dailies: gapped, anchors: [baseline(P, "2026-06-29")] }));
        expect(out[0].value).toBe(3); // 6/30 · 7/01 · 7/02
    });

    it("앵커가 가진 일봉보다 이르면 saturated — 값은 셀 수 있었던 만큼(하한)", async () => {
        const short = HISTORY.filter((d) => d.date >= "2026-06-29");
        const out = await axis.compute([P], deps({ dailies: short, anchors: [baseline(P, "2026-01-05")] }));
        expect(out[0]).toEqual({ ...P, value: 4, saturated: true }); // 6/29·6/30·7/01·7/02 만 보인다
    });

    it("앵커가 창 안에 있으면 절단이 아니다 — 실측과 하한을 섞지 않는다", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(P, "2026-06-22")] }));
        expect(out[0]).toEqual({ ...P, value: 8 });
    });

    it("앵커가 타점보다 미래면 결손 — 음수를 조용히 내지 않는다", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(P, "2026-07-10")] }));
        expect(out).toEqual([]);
    });

    it("타점 날 일봉이 미수집이면 결손 — 셀 자가 없다", async () => {
        const noToday = HISTORY.filter((d) => d.date !== DATE);
        const out = await axis.compute([P], deps({ dailies: noToday, anchors: [baseline(P, "2026-06-29")] }));
        expect(out).toEqual([]);
    });

    it("기준선 없는 타점은 캔들 읽기 없이 빠진다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.adjDaily = { getDailyCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axis.compute([P], d)).toEqual([]);
        expect(reads).toBe(0);
    });

    it("앵커 가격(field·market)을 안 읽는다 — 좌표만 쓰는 축", async () => {
        const coordOnly: PointAnchor = { ...P, param: "baseline", anchorDate: "2026-06-29" }; // field·market 없음
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [coordOnly] }));
        expect(out[0].value).toBe(3);
    });
});
