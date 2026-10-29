import { describe, expect, it } from "vitest";
import { lineLevelPct } from "./priceLevels.js";

describe("lineLevelPct — 일봉 선(수정주가) → 그 날 분봉의 당일 %", () => {
    it("평상일은 기준가 대비 %", () => {
        expect(lineLevelPct(1100, 1, 1000)).toBeCloseTo(10);
    });
    it("뒤에 액분이 있었던 날 — 수정주가를 그 날 원주가 스케일로 되돌린다(× rawScale)", () => {
        // 액분 2:1 이전 날: 수정주가 550 = 원주가 1100, 기준가(원주가 전일 종가) 1000
        expect(lineLevelPct(550, 2, 1000)).toBeCloseTo(10);
    });
});
