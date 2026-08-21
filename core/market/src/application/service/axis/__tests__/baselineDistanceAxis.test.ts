import { describe, it, expect } from "vitest";
import type { ChartAnchor, DailyCandle, ReviewPointKey } from "#domain";
import { baselineDistanceAxis } from "../baselineDistanceAxis.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02"; // 타점 날 = 창의 상한

/** 이 축은 값이 아니라 좌표만 읽는다 — OHLC 는 0(리졸버가 가격을 읽었다면 0 은 무효라 결손이 났을 것). */
const daily = (date: string, high = 0): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: "0", high: String(high), low: "0", close: "0", volume: "0", amount: "0" },
    un: { open: "0", high: String(high), low: "0", close: "0", volume: "0", amount: "0" },
});

const point = (time = "09:30:00"): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });
/** 차트 소유 기준선(선=앵커) — 타점 시각이 없다. */
const baseline = (anchorDate: string, anchorTime?: string): ChartAnchor =>
    ({ stockCode: CODE, date: DATE, param: "baseline", anchorDate, anchorTime, field: "high", market: "un" });

function deps(v: { dailies?: DailyCandle[]; anchors?: ChartAnchor[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: () => Promise.resolve([]) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []) },
        reviewPoints: { listAllPoints: () => Promise.resolve([]) },
    };
}

/** 6/22 ~ 7/02 여덟 거래일(주말 제외). 타점은 7/02. */
const HISTORY = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-29", "2026-06-30", "2026-07-01", DATE].map((d) => daily(d));

describe("baselineDistanceAxis", () => {
    const axis = baselineDistanceAxis();
    const P = point();

    it("앵커 다음 거래일부터 타점 날까지의 거래일 수 — 선 하나면 가격을 안 읽는다(고가 0 이어도 동작)", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline("2026-06-29")] }));
        expect(out).toEqual([{ ...P, value: 3 }]); // 6/30 · 7/01 · 7/02
    });

    it("주말은 안 센다 — 달력일이 아니라 거래일", async () => {
        // 6/26(금) → 7/02 는 달력으로 6일, 거래일로는 4일(6/29·6/30·7/01·7/02).
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline("2026-06-26")] }));
        expect(out[0].value).toBe(4);
    });

    it("같은 날 앵커(분봉 기준선)는 이제 결손 — day 알갱이 절단선(전일까지)이 0 이던 옛 스펙을 대체", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline(DATE, "13:00:00")] }));
        expect(out).toEqual([]);
    });

    it("앵커 날에 봉이 없어도(거래정지) 그 뒤 거래일로 센다", async () => {
        const gapped = HISTORY.filter((d) => d.date !== "2026-06-29");
        const out = await axis.compute([P], deps({ dailies: gapped, anchors: [baseline("2026-06-29")] }));
        expect(out[0].value).toBe(3); // 6/30 · 7/01 · 7/02
    });

    it("앵커가 가진 일봉보다 이르면 saturated — 값은 셀 수 있었던 만큼(하한)", async () => {
        const short = HISTORY.filter((d) => d.date >= "2026-06-29");
        const out = await axis.compute([P], deps({ dailies: short, anchors: [baseline("2026-01-05")] }));
        expect(out[0]).toEqual({ ...P, value: 4, saturated: true }); // 6/29·6/30·7/01·7/02 만 보인다
    });

    it("앵커가 창 안에 있으면 절단이 아니다 — 실측과 하한을 섞지 않는다", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline("2026-06-22")] }));
        expect(out[0]).toEqual({ ...P, value: 8 });
    });

    it("앵커가 타점보다 미래면 결손 — 음수를 조용히 내지 않는다", async () => {
        const out = await axis.compute([P], deps({ dailies: HISTORY, anchors: [baseline("2026-07-10")] }));
        expect(out).toEqual([]);
    });

    it("타점 날 일봉이 미수집이면 결손 — 셀 자가 없다", async () => {
        const noToday = HISTORY.filter((d) => d.date !== DATE);
        const out = await axis.compute([P], deps({ dailies: noToday, anchors: [baseline("2026-06-29")] }));
        expect(out).toEqual([]);
    });

    it("기준선 없는 타점은 캔들 읽기 없이 빠진다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.adjDaily = { getDailyCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axis.compute([P], d)).toEqual([]);
        expect(reads).toBe(0);
    });

    it("선이 여럿이면 가격 최저의 앵커로 거리를 잰다 — 리졸버 규칙이 이 축에도 적용", async () => {
        const priced = HISTORY.map((d) => (d.date === "2026-06-25" ? daily(d.date, 12000) : d.date === "2026-06-29" ? daily(d.date, 10000) : d));
        const out = await axis.compute([P], deps({ dailies: priced, anchors: [baseline("2026-06-25"), baseline("2026-06-29")] }));
        expect(out[0].value).toBe(3); // 낮은 선(6/29) 기준 — 높은 선(6/25)이었다면 5
    });

    it("당일 앵커는 걸러진다 — 세 축이 같은 후보 집합을 봐야 한다(공백 축과 동일 가드)", async () => {
        const d = deps({ dailies: HISTORY, anchors: [baseline(DATE)] });
        expect(await axis.compute([point()], d)).toEqual([]);
    });

    it("차트 소유 — 같은 차트의 두 타점이 같은 기준선을 본다", async () => {
        const other = point("10:00:00");
        const out = await axis.compute([P, other], deps({ dailies: HISTORY, anchors: [baseline("2026-06-29")] }));
        expect(out.map((v) => v.value)).toEqual([3, 3]);
    });
});
