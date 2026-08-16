import { describe, it, expect } from "vitest";
import type { ChartAnchor, MinuteCandle, ReviewPoint } from "#domain";
import { resolveMinuteSkeletonsForCharts, resolveMinuteSkeletons } from "../skeletonResolver.js";
import type { AxisDeps } from "../../axis/axis.js";

// 타점 종가 합성("타점 종가 = 골격의 한 점")의 규칙을 리졸버에서 직접 본다 — 축 테스트는 값으로만 보여서
// 피벗 배열 수준의 규칙(합성 여부·손 피벗 우선·synthetic 표시)이 안 잡힌다.
const CODE = "005930";
const DATE = "2026-07-02";
const KEY = `${CODE}|${DATE}`;

const bar = (time: string, price: number, over: Partial<NonNullable<MinuteCandle["un"]>> = {}): MinuteCandle => ({
    stockCode: CODE,
    date: DATE,
    time,
    krx: null,
    un: { open: String(price), high: String(price), low: String(price), close: String(price), volume: "10", ...over },
});
const mp = (anchorTime: string, field: ChartAnchor["field"] = "high"): ChartAnchor =>
    ({ stockCode: CODE, date: DATE, param: "skeleton-minute", anchorDate: DATE, anchorTime, field, market: "un" });
const point = (time: string): ReviewPoint => ({ stockCode: CODE, date: DATE, time });

const deps = (bars: MinuteCandle[], reviewPoints: ReviewPoint[] = []): Pick<AxisDeps, "minute" | "reviewPoints"> => ({
    minute: { getMinuteCandles: () => Promise.resolve(bars) },
    reviewPoints: { listByChart: () => Promise.resolve([]), listAllPoints: () => Promise.resolve(reviewPoints) },
});

const BARS = [bar("09:00:00", 4000), bar("09:10:00", 4400), bar("09:20:00", 4100), bar("09:25:00", 4160), bar("14:00:00", 4200)];
const SKEL = [mp("09:00:00", "open"), mp("09:10:00"), mp("09:25:00", "close")];

describe("resolveMinuteSkeletonsForCharts — 타점 종가 합성", () => {
    it("타점 시각의 종가가 합성 피벗으로 병합된다(synthetic 표시, 시간순 자리)", async () => {
        const out = await resolveMinuteSkeletonsForCharts(new Set([KEY]), SKEL, deps(BARS), new Map([[KEY, ["09:20:00"]]]));
        const pivots = out.get(KEY)!;
        expect(pivots.map((p) => `${p.anchorTime}${p.synthetic ? "*" : ""}`)).toEqual(["09:00:00", "09:10:00", "09:20:00*", "09:25:00"]);
        expect(pivots[2].price).toBe(4100);
        expect(pivots[2].field).toBe("close");
    });

    it("손 피벗이 있는 캔들엔 합성하지 않는다 — 직접 찍은 게 이긴다(값이 종가가 아니어도)", async () => {
        // 09:25 에 손 피벗(close)이 이미 있다 → 그 시각 타점은 합성 대상에서 빠진다(중복 점 없음).
        const out = await resolveMinuteSkeletonsForCharts(new Set([KEY]), SKEL, deps(BARS), new Map([[KEY, ["09:25:00"]]]));
        const pivots = out.get(KEY)!;
        expect(pivots).toHaveLength(3);
        expect(pivots.every((p) => !p.synthetic)).toBe(true);
    });

    it("타점 시각 분봉이 미수집이면 골격 통째 결손 — 손 피벗과 같은 규칙", async () => {
        const out = await resolveMinuteSkeletonsForCharts(new Set([KEY]), SKEL, deps(BARS), new Map([[KEY, ["11:11:00"]]]));
        expect(out.get(KEY)).toBeNull();
    });

    it("손 피벗 0개인 차트는 타점만으로 골격이 생기지 않는다 — 보강이지 창조가 아니다", async () => {
        const out = await resolveMinuteSkeletonsForCharts(new Set([KEY]), [], deps(BARS), new Map([[KEY, ["09:00:00", "09:10:00"]]]));
        expect(out.has(KEY)).toBe(false);
    });
});

describe("resolveMinuteSkeletons — 절단판의 형제 결합", () => {
    it("경로에는 **차트의 전 타점** 종가가 든다 — 요청 부분집합이 아니라(증분·전량 계산이 같은 값을 내야 한다)", async () => {
        // 14:00 하나만 계산해도 형제(09:20)의 종가 4100 이 경로의 골로 들어간다.
        const d = deps(BARS, [point("09:20:00"), point("14:00:00")]);
        const out = await resolveMinuteSkeletons([point("14:00:00")], SKEL, d);
        const pivots = out.get(`${CODE}|${DATE}|14:00:00`)!;
        expect(pivots.some((p) => p.anchorTime === "09:20:00" && p.synthetic)).toBe(true);
        expect(pivots.some((p) => p.anchorTime === "14:00:00" && p.synthetic)).toBe(true); // 자기 종가 = 경로의 끝
    });

    it("절단은 그대로 — 이른 타점은 뒤 형제의 종가를 못 본다(축 규칙 2)", async () => {
        const d = deps(BARS, [point("09:20:00"), point("14:00:00")]);
        const out = await resolveMinuteSkeletons([point("09:20:00")], SKEL, d);
        const pivots = out.get(`${CODE}|${DATE}|09:20:00`)!;
        expect(pivots.map((p) => p.anchorTime)).toEqual(["09:00:00", "09:10:00", "09:20:00"]); // 09:25·14:00 은 미래
    });

    it("자기 시각까지 피벗 2개 미만이면 미입력 — 자기 종가 하나로는 골격이 아니다", async () => {
        const early = point("08:55:00");
        const d = deps([bar("08:55:00", 3990), ...BARS], [early]);
        const out = await resolveMinuteSkeletons([early], SKEL, d);
        expect(out.has(`${CODE}|${DATE}|08:55:00`)).toBe(false);
    });
});
