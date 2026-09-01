// 격자 특징 피드 — 격자 픽스처에서 기대값을 못 박는다(축 문법에 앉기 전의 순수 층).
import { describe, expect, it } from "vitest";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { gridFeatureFeeds } from "../gridFeatures.js";
import type { AutoPointsView } from "../usePointGrids.js";

const grid: PointGrid = {
    base: 10000,
    touchMin: 550,
    pivots: [
        { kind: "high", min: 575, price: 10300, confirmedMin: 585, legAmount: "0", renewalAmount: null },
        { kind: "low", min: 590, price: 10100, confirmedMin: null, legAmount: "0", renewalAmount: null },
    ],
    newHighs: [],
    prevBase: 8000, // 그날 기준가(전일 종가) — "당일 %" 의 분모. **base 와 다른 값**으로 둔다(분모를 바꿔치면 걸리게)
};

const view = {
    isLoading: false,
    error: null,
    byChart: new Map(),
    points: [
        // 돌파 Point — 종가 10,020 → 기준선 대비 +0.2%(고가로 재면 +0.5% 라 분자 바꿔치기가 걸린다)
        { stockCode: "A", date: "2026-07-01", time: "09:20:00", point: { kind: "breakout", ordinal: 0, min: 560, high: 10050, close: 10020, tv: "0", levelPrice: 10000, levelIdx: 0, levelMin: null } },
        // 재돌파 Point — 마디(10300, min 575) 갱신. 종가 10,300 → 기준선 대비 +3%. 눌림 = (10300−10100)/10300 ≈ 1.94%
        { stockCode: "A", date: "2026-07-01", time: "10:00:00", point: { kind: "renewal", ordinal: 1, min: 600, high: 10350, close: 10300, tv: "0", levelPrice: 10300, levelIdx: 1, levelMin: 575 } },
    ],
} as unknown as AutoPointsView;

describe("gridFeatureFeeds", () => {
    const feeds = gridFeatureFeeds(view, () => grid);
    const feed = (key: string) => feeds.find((f) => f.key === key)!;

    // 키 둘은 옛 서버 축에서 **승계**했다(사용자 열 설정·필터가 이 주소를 든다) — 이름이 아니라 키를 못 박는다.
    it("기준선 대비 % — 전 Point 에 값이 선다(분자 = Point 봉 종가)", () => {
        expect(feed("baseline-position").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "09:20:00", value: 0.2 },
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 3 },
        ]);
    });

    it("당일 %(UN) — 분모는 격자에 구운 그날 기준가(기준선이 아니다)", () => {
        // 8,000 기준: 10,020 → +25.25% · 10,300 → +28.75%. base(10,000)로 재면 +0.2/+3 이라 분모 바꿔치기가 걸린다.
        expect(feed("daily-change-un").values.map((v) => v.value)).toEqual([25.25, 28.75]);
    });

    it("그날 기준가가 없으면 당일 % 만 결손 — 나머지 특징은 산다", () => {
        const feeds2 = gridFeatureFeeds(view, () => ({ ...grid, prevBase: null }));
        expect(feeds2.find((f) => f.key === "daily-change-un")!.values).toHaveLength(0);
        expect(feeds2.find((f) => f.key === "baseline-position")!.values).toHaveLength(2);
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

    it("base 가 없거나 0 이하인 격자 — 기준선 대비만 결손, 나머지 특징은 산다", () => {
        const noBase: PointGrid = { ...grid, base: null };
        const feeds2 = gridFeatureFeeds(view, () => noBase);
        expect(feeds2.find((f) => f.key === "baseline-position")!.values).toHaveLength(0);
        expect(feeds2.find((f) => f.key === "grid-prior-levels")!.values).toHaveLength(2);
    });

    it("창 안에 저점 피벗이 여럿이면 최저가 뽑힌다", () => {
        // 축약 격자(compressPivots)는 구간당 저점 1개라 이 모양이 안 나오지만, 함수는 임의 목록을 견뎌야 한다.
        const deep: PointGrid = {
            ...grid,
            pivots: [
                ...grid.pivots,
                { kind: "low", min: 595, price: 10050, confirmedMin: null, legAmount: "0", renewalAmount: null },
            ],
        };
        const v = gridFeatureFeeds(view, () => deep).find((f) => f.key === "grid-pullback-pct")!.values;
        // (10300 − 10050) / 10300 ≈ 2.43%
        expect(v).toEqual([{ stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 2.43 }]);
    });

    it("구간 최저 저점이 Point 시각 이후면 눌림 깊이는 결손(축약의 수용된 귀결)", () => {
        // 축약 격자는 kept 구간당 최저 저점 1개만 남긴다 — 그 저점이 Point(min 600) 뒤(605)에 있으면
        // 창(levelMin, pointMin] 안에 후보가 없어 결손이 된다. 창이 kept 구간 여럿을 걸치면 결손 대신
        // 더 얕은 값이 나올 수도 있다(실데이터 6,016차트 실측: 결손 전환 2.01%·값 변화 1건 — 수용).
        const lateLow: PointGrid = {
            ...grid,
            pivots: [
                { kind: "high", min: 575, price: 10300, confirmedMin: 585, legAmount: "0", renewalAmount: null },
                { kind: "low", min: 605, price: 10020, confirmedMin: null, legAmount: "0", renewalAmount: null },
            ],
        };
        expect(gridFeatureFeeds(view, () => lateLow).find((f) => f.key === "grid-pullback-pct")!.values).toHaveLength(0);
    });
});
