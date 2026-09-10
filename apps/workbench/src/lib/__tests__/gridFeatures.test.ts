// 격자 특징 피드 — 격자 픽스처에서 기대값을 못 박는다(축 문법에 앉기 전의 순수 층).
import { describe, expect, it } from "vitest";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { gridFeatureFeeds } from "../gridFeatures.js";
import type { AutoPointsView } from "../usePointGrids.js";

const grid: PointGrid = {
    base: 10000,
    touch: { min: 550, tv: "0", cum: "0" },
    pivots: [
        { kind: "high", min: 575, price: 10300, confirmedMin: 585, cum: "0", cross: null },
        { kind: "low", min: 590, price: 10100, confirmedMin: null, cum: "0", cross: null },
    ],
    newHighs: [],
    prevBase: 8000, // 그날 기준가(전일 종가) — "당일 %" 의 분모. **base 와 다른 값**으로 둔다(분모를 바꿔치면 걸리게)
    prevBaseKrx: 7900, // KRX 짝 — UN 과도 다른 값으로(두 판의 분모 바꿔치기가 걸리게)
    sessionHigh: { min: 575, price: 10300 }, // 특징 축은 안 읽는 필드 — 자리만 채운다
};

const view = {
    isLoading: false,
    error: null,
    byChart: new Map(),
    points: [
        // 돌파 Point — 종가 10,020 → 기준선 대비 +0.2%(고가로 재면 +0.5% 라 분자 바꿔치기가 걸린다)
        { stockCode: "A", date: "2026-07-01", time: "09:20:00", point: { kind: "breakout", ordinal: 0, min: 560, open: 9800, high: 10050, close: 10020, tv: "6000000000", levelPrice: 10000, levelIdx: 0, levelMin: null } },
        // 재돌파 Point — 마디(10300, min 575) 갱신. 종가 10,300 → 기준선 대비 +3%. 눌림 = (10300−10100)/10300 ≈ 1.94%
        { stockCode: "A", date: "2026-07-01", time: "10:00:00", point: { kind: "renewal", ordinal: 1, min: 600, open: 10150, high: 10350, close: 10300, tv: "3500000000", levelPrice: 10300, levelIdx: 1, levelMin: 575 } },
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

    it("당일 %(KRX) — 분모만 KRX 짝(분자는 같은 UN 종가)", () => {
        // 7,900 기준: 10,020 → +26.84% · 10,300 → +30.38%. UN 판(8,000)과 다른 값이라 분모 바꿔치기가 걸린다.
        expect(feed("grid-daily-change-krx").values.map((v) => v.value)).toEqual([26.84, 30.38]);
    });

    it("그날 기준가가 없으면 당일 % 만 결손 — 나머지 특징은 산다(UN·KRX 각각 독립)", () => {
        const feeds2 = gridFeatureFeeds(view, () => ({ ...grid, prevBase: null }));
        expect(feeds2.find((f) => f.key === "daily-change-un")!.values).toHaveLength(0);
        expect(feeds2.find((f) => f.key === "grid-daily-change-krx")!.values).toHaveLength(2); // KRX 는 산다
        expect(feeds2.find((f) => f.key === "baseline-position")!.values).toHaveLength(2);
        const feeds3 = gridFeatureFeeds(view, () => ({ ...grid, prevBaseKrx: null }));
        expect(feeds3.find((f) => f.key === "grid-daily-change-krx")!.values).toHaveLength(0);
        expect(feeds3.find((f) => f.key === "daily-change-un")!.values).toHaveLength(2); // UN 은 산다
    });

    it("재돌파 경과(분) — 마디 발생 → Point 봉, breakout 은 결손", () => {
        expect(feed("grid-renewal-elapsed").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 25 }, // 600 − 575
        ]);
    });

    it("눌림 저점 위치 — 마디=0 · Point=1 구간에서 저점 피벗의 자리(소수 둘째)", () => {
        expect(feed("grid-pullback-pos").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 0.6 }, // (590−575)/25
        ]);
    });

    it("눌림 깊이 — 마디→Point 창의 최저 저점 피벗, breakout 은 결손(값 없음)", () => {
        expect(feed("grid-pullback-pct").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 1.94 },
        ]);
    });

    it("슬롯 2 재돌파(levelIdx 0 + levelMin = 확정 고점 피벗) — 재돌파 전용 특징이 확정 고점 자로 선다", () => {
        // 기준선 슬롯 2(2026-09-06 눌림 확정 요건): 확정 고점 9,960@565(피벗) 재돌파 Point 600. levelIdx 0
        // 이지만 levelMin ≠ null 이라 breakout 결손 규칙에 안 걸리고, 경과 분 = 600−565, 눌림 창 = (565, 600].
        const slot2View = {
            ...view,
            points: [
                { stockCode: "A", date: "2026-07-01", time: "10:00:00", point: { kind: "renewal", ordinal: 0, min: 600, open: 9900, high: 10050, close: 10040, tv: "0", levelPrice: 9960, levelIdx: 0, levelMin: 565 } },
            ],
        } as unknown as AutoPointsView;
        const g: PointGrid = {
            ...grid,
            pivots: [
                { kind: "high", min: 565, price: 9960, confirmedMin: 572, cum: "0", cross: null },
                { kind: "low", min: 572, price: 9760, confirmedMin: 580, cum: "0", cross: null },
            ],
        };
        const feeds2 = gridFeatureFeeds(slot2View, () => g);
        const f = (key: string) => feeds2.find((x) => x.key === key)!.values;
        expect(f("grid-renewal-elapsed")).toEqual([{ stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 35 }]); // 600 − 565
        expect(f("grid-pullback-pct").map((v) => v.value)).toEqual([2.01]); // (9960 − 9760)/9960 — 분모 = 확정 고점
        expect(f("grid-pullback-pos").map((v) => v.value)).toEqual([0.2]); // (572 − 565)/35
    });

    it("격자가 없는 차트의 Point 는 전 특징에서 결손", () => {
        expect(gridFeatureFeeds(view, () => undefined).every((f) => f.values.length === 0)).toBe(true);
    });

    it("base 가 없거나 0 이하인 격자 — 기준선 대비만 결손, 나머지 특징은 산다", () => {
        const noBase: PointGrid = { ...grid, base: null };
        const feeds2 = gridFeatureFeeds(view, () => noBase);
        expect(feeds2.find((f) => f.key === "baseline-position")!.values).toHaveLength(0);
        expect(feeds2.find((f) => f.key === "grid-point-bar-pct")!.values).toHaveLength(2);
    });

    it("창 안에 저점 피벗이 여럿이면 최저가 뽑힌다", () => {
        // 축약 격자(compressPivots)는 구간당 저점 1개라 이 모양이 안 나오지만, 함수는 임의 목록을 견뎌야 한다.
        const deep: PointGrid = {
            ...grid,
            pivots: [
                ...grid.pivots,
                { kind: "low", min: 595, price: 10050, confirmedMin: null, cum: "0", cross: null },
            ],
        };
        const deepFeeds = gridFeatureFeeds(view, () => deep);
        // (10300 − 10050) / 10300 ≈ 2.43%
        expect(deepFeeds.find((f) => f.key === "grid-pullback-pct")!.values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 2.43 },
        ]);
        // 저점 위치도 **같은 저점**(최저)을 본다 — (595−575)/25 = 0.8. 선정 규칙이 두 벌로 갈리면 여기서 걸린다.
        expect(deepFeeds.find((f) => f.key === "grid-pullback-pos")!.values.map((v) => v.value)).toEqual([0.8]);
    });

    it("타점 대금 — 자기 봉 대금을 억원으로(게이트가 본 그 값)", () => {
        expect(feed("grid-point-tv").values).toEqual([
            { stockCode: "A", date: "2026-07-01", time: "09:20:00", value: 60 },
            { stockCode: "A", date: "2026-07-01", time: "10:00:00", value: 35 },
        ]);
        // 로그 척도 선언 — 값이 30억~수천억으로 갈려 선형 레일이면 왼쪽에 뭉갠다.
        expect(feed("grid-point-tv").display).toMatchObject({ suffix: "억", scale: "log" });
    });

    it("타점 대금 0 이하는 결손 — 로그 정의역(양수)을 계산이 보장한다", () => {
        const zero = { ...view, points: view.points.map((p) => ({ ...p, point: { ...p.point, tv: "0" } })) } as unknown as AutoPointsView;
        const f = gridFeatureFeeds(zero, () => grid);
        expect(f.find((x) => x.key === "grid-point-tv")!.values).toHaveLength(0);
        expect(f.find((x) => x.key === "grid-point-bar-pct")!.values).toHaveLength(2); // 진폭은 산다(독립)
    });

    it("봉 진폭(시→고) — 분모는 **그 봉 시가**(전일 종가도 기준선도 아니다)", () => {
        // 9,800→10,050 = +2.55% · 10,150→10,350 = +1.97%. 전일 종가(8,000) 분모면 +25/+29 라 분모 바꿔치기가 걸린다.
        expect(feed("grid-point-bar-pct").values.map((v) => v.value)).toEqual([2.55, 1.97]);
    });

    it("시가가 0 이하면 봉 진폭만 결손", () => {
        const noOpen = { ...view, points: view.points.map((p) => ({ ...p, point: { ...p.point, open: 0 } })) } as unknown as AutoPointsView;
        const f = gridFeatureFeeds(noOpen, () => grid);
        expect(f.find((x) => x.key === "grid-point-bar-pct")!.values).toHaveLength(0);
        expect(f.find((x) => x.key === "grid-point-tv")!.values).toHaveLength(2); // 대금은 산다
    });

    it("피드는 8개 — 고점·다리 축(grid-high-·grid-leg-)과 직전 마디 수는 은퇴했다", () => {
        expect(feeds).toHaveLength(8);
        expect(feeds.some((f) => f.key === "grid-prior-levels")).toBe(false);
        expect(feeds.some((f) => f.key.startsWith("grid-high-") || f.key.startsWith("grid-leg-"))).toBe(false);
    });

    it("구간 최저 저점이 Point 시각 이후면 눌림 깊이는 결손(축약의 수용된 귀결)", () => {
        // 축약 격자는 kept 구간당 최저 저점 1개만 남긴다 — 그 저점이 Point(min 600) 뒤(605)에 있으면
        // 창(levelMin, pointMin] 안에 후보가 없어 결손이 된다. 창이 kept 구간 여럿을 걸치면 결손 대신
        // 더 얕은 값이 나올 수도 있다(실데이터 6,016차트 실측: 결손 전환 2.01%·값 변화 1건 — 수용).
        const lateLow: PointGrid = {
            ...grid,
            pivots: [
                { kind: "high", min: 575, price: 10300, confirmedMin: 585, cum: "0", cross: null },
                { kind: "low", min: 605, price: 10020, confirmedMin: null, cum: "0", cross: null },
            ],
        };
        const lateFeeds = gridFeatureFeeds(view, () => lateLow);
        expect(lateFeeds.find((f) => f.key === "grid-pullback-pct")!.values).toHaveLength(0);
        expect(lateFeeds.find((f) => f.key === "grid-pullback-pos")!.values).toHaveLength(0); // 같은 저점 = 같은 결손
        expect(lateFeeds.find((f) => f.key === "grid-renewal-elapsed")!.values).toHaveLength(1); // 경과는 저점 무관
    });
});
