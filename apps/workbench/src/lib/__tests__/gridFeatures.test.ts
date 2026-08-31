// 격자 특징 피드 — 격자 픽스처에서 기대값을 못 박는다(축 문법에 앉기 전의 순수 층).
import { describe, expect, it } from "vitest";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { gridFeatureFeeds } from "../gridFeatures.js";
import type { AutoPointsView } from "../usePointGrids.js";

const grid: PointGrid = {
    base: 10000,
    touchMin: 550,
    pivots: [
        { kind: "high", min: 575, price: 10300, confirmedMin: 585, legAmount: "0" },
        { kind: "low", min: 590, price: 10100, confirmedMin: 591, legAmount: "0" },
    ],
    newHighs: [],
};

const view = {
    isLoading: false,
    error: null,
    byChart: new Map(),
    points: [
        // 돌파 Point — 기준선 대비 +0.5%, 직전 마디 0, 눌림 없음(levelMin null → 결손)
        { stockCode: "A", date: "2026-07-01", time: "09:20:00", point: { kind: "breakout", ordinal: 0, min: 560, high: 10050, tvMax2: "0", levelPrice: 10000, levelIdx: 0, levelMin: null } },
        // 재돌파 Point — 마디(10300, min 575) 갱신. 눌림 = (10300−10100)/10300 ≈ 1.94%
        { stockCode: "A", date: "2026-07-01", time: "10:00:00", point: { kind: "renewal", ordinal: 1, min: 600, high: 10350, tvMax2: "0", levelPrice: 10300, levelIdx: 1, levelMin: 575 } },
    ],
} as unknown as AutoPointsView;

describe("gridFeatureFeeds", () => {
    const feeds = gridFeatureFeeds(view, () => grid);
    const feed = (key: string) => feeds.find((f) => f.key === key)!;

    it("기준선 대비 % — 전 Point 에 값이 선다", () => {
        expect(feed("grid-baseline-pct").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "09:20:00", value: 0.5 },
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 3.5 },
        ]);
    });

    it("직전 마디 수 — levelIdx 그대로(0 = 기준선 돌파)", () => {
        expect(feed("grid-prior-levels").values.map((v) => v.value)).toEqual([0, 1]);
    });

    it("눌림 깊이 — 마디→Point 창의 최저 저점 피벗, breakout 은 결손(값 없음)", () => {
        expect(feed("grid-pullback-pct").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 1.94 },
        ]);
    });

    it("격자가 없는 차트의 Point 는 전 특징에서 결손", () => {
        expect(gridFeatureFeeds(view, () => undefined).every((f) => f.values.length === 0)).toBe(true);
    });
});
