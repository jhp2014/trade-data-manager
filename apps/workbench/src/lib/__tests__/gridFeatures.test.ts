// 격자 특징 피드 — 격자 픽스처에서 기대값을 못 박는다(축 문법에 앉기 전의 순수 층).
import { describe, expect, it } from "vitest";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { gridFeatureFeeds } from "../gridFeatures.js";
import type { AutoPointsView } from "../usePointGrids.js";

const r1 = (x: number): number => Math.round(x * 10) / 10;

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

    it("갱신 렌즈(기본)엔 고점·다리 축이 **없다** — 시그널 이후 정보라 결손이 아니라 피드에서 빠진다(누출 게이트)", () => {
        expect(feeds).toHaveLength(7);
        expect(feeds.some((f) => f.key.startsWith("grid-high-") || f.key.startsWith("grid-leg-"))).toBe(false);
        expect(gridFeatureFeeds(view, () => grid, "renewal")).toHaveLength(7);
    });

    describe("고점 렌즈 — 상속 7 + 고점 판 4 + 다리 축 3", () => {
        // 다리 고점을 세우려면 격자에 크로싱·터치 누적이 필요하다. 세션: 터치 550(tv 1억, cum 1억) → 돌파 Point 560
        // → H1 575(cum 6억, 첫 고점) → 저점 590(cum 8억) → 크로싱 598(tv 0.5억, cum 8.5억) → 재돌파 Point 600
        // → H2 620(price 10600, cum 12.5억) → 저점 630(cum 13억).
        const eok = (n: number): string => String(Math.round(n * 100_000_000));
        const highGrid: PointGrid = {
            ...grid,
            touch: { min: 550, tv: eok(1), cum: eok(1) },
            pivots: [
                { kind: "high", min: 575, price: 10300, confirmedMin: 585, cum: eok(6), cross: null },
                { kind: "low", min: 590, price: 10100, confirmedMin: null, cum: eok(8), cross: null },
                { kind: "high", min: 620, price: 10600, confirmedMin: 625, cum: eok(12.5), cross: { min: 598, tv: eok(0.5), cum: eok(8.5) } },
                { kind: "low", min: 630, price: 10400, confirmedMin: null, cum: eok(13), cross: null },
            ],
        };
        const hf = gridFeatureFeeds(view, () => highGrid, "high");
        const hfeed = (key: string) => hf.find((f) => f.key === key)!;

        it("피드 14개 — 상속 7개는 갱신 렌즈와 **같은 값**(고점 시점 재계산 없음)", () => {
            expect(hf).toHaveLength(14);
            expect(hf.slice(0, 7).map((f) => f.key)).toEqual(feeds.map((f) => f.key));
            expect(hfeed("baseline-position").values.map((v) => v.value)).toEqual([0.2, 3]);
        });

        it("고점 판 — 분자는 **고점가**(Point 종가가 아니다): 돌파 → H1 10,300, 재돌파 → H2 10,600", () => {
            expect(hfeed("grid-high-baseline-pct").values.map((v) => v.value)).toEqual([3, 6]); // (10300−10000)/10000 · (10600−10000)/10000
            expect(hfeed("grid-high-daily-change-un").values.map((v) => v.value)).toEqual([28.75, 32.5]); // /8000
            expect(hfeed("grid-high-daily-change-krx").values.map((v) => v.value)).toEqual([30.38, 34.18]); // /7900
            expect(hfeed("grid-high-min").values.map((v) => v.value)).toEqual([575, 620]);
        });

        it("다리 축 — 창 = 레벨 크로싱 봉 → 고점 봉: 돌파는 터치 봉부터, 재돌파는 전고점 크로싱 봉부터", () => {
            // 돌파: 터치 550 → H1 575 = 25분, 대금 6−1+1 = 6억 / 26봉. 재돌파: 크로싱 598 → H2 620 = 22분, 대금 12.5−8.5+0.5 = 4.5억 / 23봉.
            expect(hfeed("grid-leg-minutes").values.map((v) => v.value)).toEqual([25, 22]);
            expect(hfeed("grid-leg-amount-per-min").values.map((v) => v.value)).toEqual([r1(6 / 26), r1(4.5 / 23)]);
            // 레벨가 대비 상승: 돌파 (10300−10000)/10000 = 3%(= 고점 기준선 대비 %, 정의상 동일) · 재돌파 (10600−10300)/10300 ≈ 2.91%
            expect(hfeed("grid-leg-rise-pct").values.map((v) => v.value)).toEqual([3, 2.91]);
        });

        it("꼬리 시그널(이후 확정 고점 없음)은 고점·다리 축 전부 결손 — 행은 남는다", () => {
            const tail: PointGrid = { ...highGrid, pivots: highGrid.pivots.slice(0, 2) }; // H2 없음 → 재돌파 Point(600)는 꼬리
            const tf = gridFeatureFeeds(view, () => tail, "high");
            for (const k of ["grid-high-baseline-pct", "grid-high-min", "grid-leg-minutes", "grid-leg-amount-per-min", "grid-leg-rise-pct"]) {
                expect(tf.find((f) => f.key === k)!.values.map((v) => v.time)).toEqual(["09:20:00"]);
            }
            expect(tf.find((f) => f.key === "baseline-position")!.values).toHaveLength(2); // 상속 축은 그대로
        });

        it("미터치 격자(touch null)에서 돌파 다리 축만 결손 — 고점 판은 산다", () => {
            const noTouch: PointGrid = { ...highGrid, touch: null };
            const nf = gridFeatureFeeds(view, () => noTouch, "high");
            expect(nf.find((f) => f.key === "grid-leg-minutes")!.values.map((v) => v.time)).toEqual(["10:00:00"]);
            expect(nf.find((f) => f.key === "grid-high-min")!.values).toHaveLength(2);
        });
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
