import { describe, expect, it } from "vitest";
import { zoneMarksOf } from "../zoneMarks.js";

// x 반전 스케일(1위 = 오른쪽) · y 정방. 뷰 [1, 200].
const xScale = { px: (v: number) => 700 - v, inDomain: (v: number) => v >= 1 && v <= 200 };
const yScale = { px: (v: number) => 100 + v, inDomain: (v: number) => v >= 1 && v <= 200 };
const BOX = { left: 44, top: 16, width: 640, height: 300 };

describe("zoneMarksOf — 선·면", () => {
    it("두 변 다 서면 면 = 1위 코너(오른쪽-위) 사각", () => {
        const m = zoneMarksOf({ x: 60, y: 40 }, xScale, yScale, BOX);
        expect(m.vpx).toBe(640);
        expect(m.hpy).toBe(140);
        expect(m.rect).toEqual({ x: 640, y: 16, w: 44, h: 124 });
    });

    it("도메인 밖의 변은 선째 접는다 — 한 변만 서면 면 없음, 둘 다 밖이면 전부 null", () => {
        const m = zoneMarksOf({ x: 60, y: 999 }, xScale, yScale, BOX);
        expect(m.vpx).toBe(640);
        expect(m.hpy).toBeNull();
        expect(m.rect).toBeNull();
        const none = zoneMarksOf({ x: 999, y: 999 }, xScale, yScale, BOX);
        expect(none.vpx).toBeNull();
        expect(none.hpy).toBeNull();
        expect(none.rect).toBeNull();
    });

    it("null 변은 그 변만 접는다(축 불일치 — 창이 다른 N 을 이 축에 긋지 않는다)", () => {
        const m = zoneMarksOf({ x: null, y: 40 }, xScale, yScale, BOX);
        expect(m.vpx).toBeNull();
        expect(m.hpy).toBe(140);
        expect(m.rect).toBeNull();
    });
});
