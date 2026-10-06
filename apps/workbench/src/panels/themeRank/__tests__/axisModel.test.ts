import { describe, expect, it } from "vitest";
import {
    AMOUNT_VIEW,
    DEFAULT_AXES,
    RANK_SPAN_MIN,
    RATE_PAN,
    foldedBelowCount,
    gateVdom,
    panAmountDom,
    panRateDom,
    parseThemeRankAxes,
    rankScaleX,
    rankScaleY,
    rateAutoView,
    valueScaleX,
    valueScaleY,
    zoomRateDom,
} from "../axisModel.js";

const BOX = { left: 60, top: 16, width: 400, height: 400 };

describe("parseThemeRankAxes — 관대한 병합", () => {
    it("빈/깨진 저장물은 기본값", () => {
        expect(parseThemeRankAxes(null)).toEqual(DEFAULT_AXES);
        expect(parseThemeRankAxes("junk")).toEqual(DEFAULT_AXES);
        expect(parseThemeRankAxes({ xMode: "??", windowMin: -5 })).toEqual(DEFAULT_AXES);
    });

    it("유효 필드만 얹는다 — 임의 분 창 허용(관찰판)", () => {
        expect(parseThemeRankAxes({ yMode: "value", windowMin: 45 }))
            .toEqual({ xMode: "rank", yMode: "value", windowMin: 45, xSpan: 150, ySpan: 150 });
    });

    it("순위 창 — 옛 저장물(필드 없음)은 150, 하한 10 클램프·반올림, 깨진 값은 150", () => {
        expect(parseThemeRankAxes({}).xSpan).toBe(150);
        expect(parseThemeRankAxes({ xSpan: 5 }).xSpan).toBe(RANK_SPAN_MIN);
        expect(parseThemeRankAxes({ xSpan: 120.4, ySpan: 80 })).toMatchObject({ xSpan: 120, ySpan: 80 });
        expect(parseThemeRankAxes({ xSpan: "abc", ySpan: -3 })).toMatchObject({ xSpan: 150, ySpan: 150 });
    });
});

describe("rateAutoView — 등락 값 축 자동맞춤(현재 분까지 최고 +3%p)", () => {
    it("재료 없음(null) = [0, 5](하한 = 줌 하한)", () => {
        expect(rateAutoView(null)).toEqual({ lo: 0, hi: 5 });
    });
    it("낮은 최고는 하한 5 로, 보통은 +3, 높은 최고는 상한 31 클램프", () => {
        expect(rateAutoView(1)).toEqual({ lo: 0, hi: 5 });
        expect(rateAutoView(-2)).toEqual({ lo: 0, hi: 5 });
        expect(rateAutoView(10)).toEqual({ lo: 0, hi: 13 });
        expect(rateAutoView(15)).toEqual({ lo: 0, hi: 18 });
        expect(rateAutoView(29.9)).toEqual({ lo: 0, hi: 31 });
    });
});

describe("gateVdom — 값 축 수동 창의 시선(종목,날짜) 게이트", () => {
    const dom = { lo: 0, hi: 12 };
    it("태그 일치면 통과(x/y 유효한 것만)", () => {
        expect(gateVdom({ code: "A", date: "2026-10-02", y: dom }, "A", "2026-10-02")).toEqual({ y: dom });
        expect(gateVdom({ code: "A", date: "2026-10-02", x: { lo: 1e8, hi: 1e11 }, y: dom }, "A", "2026-10-02"))
            .toEqual({ x: { lo: 1e8, hi: 1e11 }, y: dom });
    });
    it("종목·날짜가 다르면 버린다(= 자동맞춤 복귀)", () => {
        expect(gateVdom({ code: "A", date: "2026-10-02", y: dom }, "B", "2026-10-02")).toBeNull();
        expect(gateVdom({ code: "A", date: "2026-10-02", y: dom }, "A", "2026-10-03")).toBeNull();
    });
    it("태그 없는 옛 모양·깨진 모양은 버린다", () => {
        expect(gateVdom({ y: dom }, "A", "2026-10-02")).toBeNull();
        expect(gateVdom({ code: "A", date: "2026-10-02", y: { lo: 5, hi: 5 } }, "A", "2026-10-02")).toBeNull();
        expect(gateVdom(null, "A", "2026-10-02")).toBeNull();
        expect(gateVdom({ code: "A", date: "2026-10-02", y: dom }, undefined, undefined)).toBeNull();
    });
});

describe("순위 스케일 — 1위 = 오른쪽/위(2026-09-17 반전), px/invert 왕복", () => {
    it("x: 1위가 오른쪽 끝, 도메인 끝(약한 쪽)이 왼쪽 끝", () => {
        const x = rankScaleX({ x0: 1, x1: 200 }, BOX, 600, null);
        expect(x.px(1)).toBeCloseTo(BOX.left + BOX.width);
        expect(x.px(200)).toBeCloseTo(BOX.left);
        expect(x.px(50)).toBeGreaterThan(x.px(150)); // 강할수록 오른쪽
        expect(x.invert(x.px(37))).toBe(37);
        expect(x.fmt(3)).toBe("3위");
        expect(x.title).toContain("1위 →");
    });

    it("y: 1위 = 위(원래 일관)", () => {
        const y = rankScaleY({ y0: 1, y1: 200 }, BOX, 600);
        expect(y.px(1)).toBeCloseTo(BOX.top);
        expect(y.px(200)).toBeCloseTo(BOX.top + BOX.height);
        expect(y.invert(y.px(37))).toBe(37);
    });

    it("inDomain 은 뷰 도메인 기준 — 창 밖의 서수는 밖이다", () => {
        const x = rankScaleX({ x0: 1, x1: 200 }, BOX, 600, 60);
        expect(x.inDomain(200)).toBe(true);
        expect(x.inDomain(201)).toBe(false);
        expect(x.chip).toBe("60분 대금");
    });
});

describe("값 스케일 — 기본 창(등락 = 자동맞춤 도메인)", () => {
    it("등락: 자동맞춤 창 [0, 18], 큰 값 = 위, 왕복 근사", () => {
        const y = valueScaleY(rateAutoView(15), BOX);
        expect(y.px(18)).toBeCloseTo(BOX.top);
        expect(y.px(0)).toBeCloseTo(BOX.top + BOX.height);
        expect(y.px(-5)).toBeCloseTo(BOX.top + BOX.height); // 창 아래는 가장자리 클램프(접힘 배지 몫)
        expect(y.invert(y.px(12))).toBeCloseTo(12, 6);
        expect(y.inDomain(-1)).toBe(false);
        expect(y.inDomain(19)).toBe(false);
    });

    it("대금: 기본 창 [1억, 1조] 로그, 큰 값 = 오른쪽", () => {
        const x = valueScaleX(AMOUNT_VIEW, BOX, 60);
        expect(x.px(1e8)).toBeCloseTo(BOX.left);
        expect(x.px(1e12)).toBeCloseTo(BOX.left + BOX.width);
        expect(x.px(1e10)).toBeCloseTo(BOX.left + BOX.width / 2);
        expect(x.invert(x.px(3e9))).toBeCloseTo(3e9, -6);
        expect(x.inDomain(5e7)).toBe(false);
    });
});

describe("값 축 팬/줌 — 폭 보존·RATE_PAN 한계(자동맞춤 창과 별개 상수)", () => {
    it("등락: 하한 −30 까지, 창 폭 유지", () => {
        const view = { lo: 0, hi: 31 };
        const d1 = panRateDom(view, -10);
        expect(d1).toEqual({ lo: -10, hi: 21 });
        const d2 = panRateDom(view, -999);
        expect(d2.lo).toBe(RATE_PAN.lo);
        expect(d2.hi - d2.lo).toBeCloseTo(31);
        expect(panRateDom(view, 5)).toEqual(view); // 폭 31 은 이미 상한에 닿아 있다
    });

    it("등락: 좁은 자동맞춤 창은 위로 31 까지 팬이 열린다(옛 '기본 창 = 상한' 폐지)", () => {
        const d = panRateDom(rateAutoView(5), 30); // [0, 8] → 위로
        expect(d).toEqual({ lo: 23, hi: 31 });
    });

    it("등락 줌: 자동맞춤 창에서 시작해도 [−30, 31] 한계를 지킨다", () => {
        const out = zoomRateDom(rateAutoView(5), 100, 0.5); // 폭 8 → 과대 확대
        expect(out.lo).toBeGreaterThanOrEqual(RATE_PAN.lo);
        expect(out.hi).toBeLessThanOrEqual(RATE_PAN.hi);
        const shrunk = zoomRateDom({ lo: 0, hi: 5 }, 0.1, 0.5);
        expect(shrunk.hi - shrunk.lo).toBeGreaterThanOrEqual(5); // 폭 하한 5(리뷰 — hi 가 아니라 폭을 잰다)
    });

    it("대금: 로그 공간 이동, [1e6, 1e13] 한계", () => {
        const d = panAmountDom(AMOUNT_VIEW, -1);
        expect(d.lo).toBeCloseTo(1e7);
        expect(d.hi).toBeCloseTo(1e11);
        const lim = panAmountDom(AMOUNT_VIEW, -99);
        expect(lim.lo).toBeCloseTo(1e6);
    });
});

describe("foldedBelowCount — 창 아래 접힌 값의 수", () => {
    it("lo 미만만 센다(경계는 포함 안 됨 = 그려진다)", () => {
        expect(foldedBelowCount([-3, 0, 0.5, 12], 0)).toBe(1);
        expect(foldedBelowCount([], 0)).toBe(0);
    });
});
