import { describe, expect, it } from "vitest";
import {
    AMOUNT_VIEW,
    DEFAULT_AXES,
    RATE_PAN_LO,
    RATE_VIEW,
    foldedBelowCount,
    panAmountDom,
    panRateDom,
    parseThemeRankAxes,
    rankScaleX,
    rankScaleY,
    valueScaleX,
    valueScaleY,
} from "../axisModel.js";

const BOX = { left: 60, top: 16, width: 400, height: 400 };

describe("parseThemeRankAxes — 관대한 병합", () => {
    it("빈/깨진 저장물은 기본값", () => {
        expect(parseThemeRankAxes(null)).toEqual(DEFAULT_AXES);
        expect(parseThemeRankAxes("junk")).toEqual(DEFAULT_AXES);
        expect(parseThemeRankAxes({ xMode: "??", windowMin: -5 })).toEqual(DEFAULT_AXES);
    });

    it("유효 필드만 얹는다 — 임의 분 창 허용(관찰판)", () => {
        expect(parseThemeRankAxes({ yMode: "value", windowMin: 45 })).toEqual({ xMode: "rank", yMode: "value", windowMin: 45 });
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

    it("inDomain 은 뷰 도메인 기준 — 200 창 밖의 서수는 밖이다", () => {
        const x = rankScaleX({ x0: 1, x1: 200 }, BOX, 600, 60);
        expect(x.inDomain(200)).toBe(true);
        expect(x.inDomain(201)).toBe(false);
        expect(x.chip).toBe("60분 대금");
    });
});

describe("값 스케일 — 고정 도메인(데이터 추종 폐지)", () => {
    it("등락: 기본 창 [0, 31], 큰 값 = 위, 왕복 근사", () => {
        const y = valueScaleY(RATE_VIEW, BOX);
        expect(y.px(31)).toBeCloseTo(BOX.top);
        expect(y.px(0)).toBeCloseTo(BOX.top + BOX.height);
        expect(y.px(-5)).toBeCloseTo(BOX.top + BOX.height); // 창 아래는 가장자리 클램프(접힘 배지 몫)
        expect(y.invert(y.px(12))).toBeCloseTo(12, 6);
        expect(y.inDomain(-1)).toBe(false);
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

describe("값 축 팬 — 폭 보존·한계 클램프", () => {
    it("등락: 하한 −30 까지, 창 폭 31 유지", () => {
        const d1 = panRateDom(RATE_VIEW, -10);
        expect(d1).toEqual({ lo: -10, hi: 21 });
        const d2 = panRateDom(RATE_VIEW, -999);
        expect(d2.lo).toBe(RATE_PAN_LO);
        expect(d2.hi - d2.lo).toBeCloseTo(31);
        expect(panRateDom(RATE_VIEW, 5)).toEqual(RATE_VIEW); // 위로는 이미 상한
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
