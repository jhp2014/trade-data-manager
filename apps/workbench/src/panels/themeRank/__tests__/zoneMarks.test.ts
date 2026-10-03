import { describe, expect, it } from "vitest";
import { ZONE_TAG_H, zoneMarksOf, zoneTagText } from "../zoneMarks.js";
import { LBL_H, LBL_W } from "../useThemePlane.js";

// x 반전 스케일(1위 = 오른쪽) · y 정방. 뷰 [1, 200].
const xScale = { px: (v: number) => 700 - v, inDomain: (v: number) => v >= 1 && v <= 200, fmt: (v: number) => `${Math.round(v)}위` };
const yScale = { px: (v: number) => 100 + v, inDomain: (v: number) => v >= 1 && v <= 200, fmt: (v: number) => `${Math.round(v)}위` };
const BOX = { left: 44, top: 16, width: 640, height: 300 };

describe("zoneMarksOf — 선·면·배지", () => {
    it("두 변 다 서면 면 = 1위 코너(오른쪽-위) 사각, 배지는 판 안쪽 가장자리(세로선 = 위, 가로선 = 왼쪽)", () => {
        const m = zoneMarksOf({ x: 60, y: 40, from: "테마" }, xScale, yScale, BOX);
        expect(m.vpx).toBe(640);
        expect(m.hpy).toBe(140);
        expect(m.rect).toEqual({ x: 640, y: 16, w: 44, h: 124 });
        expect(m.vBadge).toMatchObject({ y: BOX.top + 3, text: "60위" });
        expect(m.vBadge!.x).toBeLessThanOrEqual(BOX.left + BOX.width - LBL_W); // 오른쪽 끝 클램프
        expect(m.hBadge).toMatchObject({ x: BOX.left + 3, text: "40위" });
        expect(m.hBadge!.y).toBeCloseTo(140 - LBL_H / 2);
    });

    it("도메인 밖의 변은 선·배지째 접는다 — 둘 다 밖이면 면·이름표도 없다", () => {
        const m = zoneMarksOf({ x: 60, y: 999, from: "" }, xScale, yScale, BOX);
        expect(m.hpy).toBeNull();
        expect(m.hBadge).toBeNull();
        expect(m.rect).toBeNull();
        const none = zoneMarksOf({ x: 999, y: 999, from: "" }, xScale, yScale, BOX);
        expect(none.vpx).toBeNull();
        expect(none.nameTag).toBeNull();
    });
});

describe("zoneMarksOf — 이름표 자리", () => {
    it("두 변: 교차점 오른쪽-아래, 오른쪽이 모자라면 선 왼쪽으로 뒤집는다", () => {
        const near = zoneMarksOf({ x: 5, y: 40, from: "테마" }, xScale, yScale, BOX); // vpx = 695 — 오른쪽 끝
        expect(near.nameTag!.x).toBeLessThan(695); // 뒤집힘
        const mid = zoneMarksOf({ x: 160, y: 40, from: "테마" }, xScale, yScale, BOX); // vpx = 540
        expect(mid.nameTag!.x).toBe(546);
        expect(mid.nameTag!.y).toBe(144);
    });

    it("아래가 모자라면 선 위로", () => {
        const low = zoneMarksOf({ x: 160, y: 199, from: "테마" }, xScale, yScale, BOX); // hpy = 299, bottom = 316
        expect(low.nameTag!.y).toBe(299 - 4 - ZONE_TAG_H);
    });

    it("한 변만: 그 배지 곁(세로선 = 배지 아래, 가로선 = 배지 오른쪽)", () => {
        const v = zoneMarksOf({ x: 160, y: null, from: "테마" }, xScale, yScale, BOX);
        expect(v.nameTag!.y).toBe(BOX.top + 3 + LBL_H + 3);
        const h = zoneMarksOf({ x: null, y: 40, from: "테마" }, xScale, yScale, BOX);
        expect(h.nameTag!.x).toBe(BOX.left + 3 + LBL_W + 6);
    });
});

describe("zoneTagText — 출처 글자", () => {
    it("빈 출처는 「존」, 길면 말줄임", () => {
        expect(zoneTagText("")).toBe("존");
        expect(zoneTagText(" ")).toBe("존");
        expect(zoneTagText("테마")).toBe("존 — 테마");
        const long = zoneTagText("아주아주아주아주아주아주아주아주아주아주 긴 경로 › 이름");
        expect(long.endsWith("…")).toBe(true);
    });
});
