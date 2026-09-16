import { describe, expect, it } from "vitest";
import {
    DEFAULT_AXES,
    isJudgmentSpace,
    isZoomable,
    parseThemeRankAxes,
    rankScaleX,
    rankScaleY,
    valueScaleX,
    valueScaleY,
} from "../axisModel.js";

const BOX = { left: 40, top: 10, width: 400, height: 400 };

describe("parseThemeRankAxes — 관대한 병합", () => {
    it("빈/깨진 저장물은 기본값", () => {
        expect(parseThemeRankAxes(null)).toEqual(DEFAULT_AXES);
        expect(parseThemeRankAxes("junk")).toEqual(DEFAULT_AXES);
        expect(parseThemeRankAxes({ xMode: "??", windowMin: -5 })).toEqual(DEFAULT_AXES);
    });

    it("유효 필드만 얹는다", () => {
        expect(parseThemeRankAxes({ yMode: "value", windowMin: 60 })).toEqual({ xMode: "rank", yMode: "value", windowMin: 60 });
    });
});

describe("isJudgmentSpace — 판정 층은 술어 공간과 일치할 때만", () => {
    it("기본(당일 순위 평면)만 참 — 창·값 모드는 거짓", () => {
        expect(isJudgmentSpace(DEFAULT_AXES, null)).toBe(true);
        expect(isJudgmentSpace({ ...DEFAULT_AXES, windowMin: 60 }, null)).toBe(false);
        expect(isJudgmentSpace({ ...DEFAULT_AXES, xMode: "value" }, null)).toBe(false);
        // zoneAmountWindow(60) 도입 후 — 창이 술어와 같으면 다시 참이 된다.
        expect(isJudgmentSpace({ ...DEFAULT_AXES, windowMin: 60 }, 60)).toBe(true);
    });

    it("줌은 서수×서수에서만(창은 무관 — 여전히 정사각 서수 도메인)", () => {
        expect(isZoomable(DEFAULT_AXES)).toBe(true);
        expect(isZoomable({ ...DEFAULT_AXES, windowMin: 60 })).toBe(true);
        expect(isZoomable({ ...DEFAULT_AXES, yMode: "value" })).toBe(false);
    });
});

describe("스케일 — px/invert 왕복과 방향", () => {
    it("서수 축: 1 = 왼쪽/위, invert 는 정수 클램프", () => {
        const x = rankScaleX({ x0: 1, x1: 100 }, BOX, 100, null);
        const y = rankScaleY({ y0: 1, y1: 100 }, BOX, 100);
        expect(x.px(1)).toBeCloseTo(BOX.left);
        expect(y.px(1)).toBeCloseTo(BOX.top);
        expect(x.invert(x.px(37))).toBe(37);
        expect(x.invert(-999)).toBe(1);
        expect(x.invert(9999)).toBe(100);
        expect(x.fmt(3)).toBe("3위");
    });

    it("값 축(등락 선형): 큰 값 = 위, 왕복 근사", () => {
        const y = valueScaleY([-2, 0, 12.5], BOX);
        expect(y.px(12.5)).toBeLessThan(y.px(-2));
        expect(y.invert(y.px(5))).toBeCloseTo(5, 6);
        expect(y.fmt(3.2)).toBe("+3.2%");
    });

    it("값 축(대금 로그): 큰 값 = 오른쪽, 0 은 왼쪽 끝(값이지 결손이 아니다)", () => {
        const x = valueScaleX([5e8, 3e10, 0], BOX, 60);
        expect(x.px(3e10)).toBeGreaterThan(x.px(5e8));
        expect(x.px(0)).toBeLessThanOrEqual(x.px(5e8));
        expect(x.invert(x.px(1e9))).toBeCloseTo(1e9, -3);
        expect(x.chip).toBe("60분 대금");
    });
});
