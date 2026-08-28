import { describe, it, expect } from "vitest";
import { ordToFrac, fracToOrd } from "../ordinalScale.js";

describe("ordToFrac — √ 척도", () => {
    it("양 끝은 0 과 1", () => {
        expect(ordToFrac(1, 600)).toBe(0);
        expect(ordToFrac(600, 600)).toBe(1);
    });

    it("상위권이 펼쳐진다 — 중간 서수가 선형(0.5)보다 오른쪽에 선다", () => {
        // 300위/600 은 선형이면 ~0.5, √ 면 ~0.707 — 왼쪽 절반이 상위 150위까지만 차지한다.
        expect(ordToFrac(300, 600)).toBeCloseTo(Math.sqrt(299 / 599), 6);
        expect(ordToFrac(300, 600)).toBeGreaterThan(0.5);
    });

    it("범위 밖은 클램프", () => {
        expect(ordToFrac(0, 600)).toBe(0);
        expect(ordToFrac(9999, 600)).toBe(1);
    });

    it("도메인이 자리 하나뿐이면 강한 끝(0)", () => {
        expect(ordToFrac(1, 1)).toBe(0);
        expect(ordToFrac(5, 0)).toBe(0);
    });
});

describe("fracToOrd — 역함수 + 정수 스냅", () => {
    it("왕복이 서수를 보존한다", () => {
        for (const ord of [1, 2, 30, 60, 80, 299, 600]) {
            expect(fracToOrd(ordToFrac(ord, 600), 600)).toBe(ord);
        }
    });

    it("범위 밖 프랙션은 1..max 로 클램프", () => {
        expect(fracToOrd(-0.5, 600)).toBe(1);
        expect(fracToOrd(1.5, 600)).toBe(600);
    });

    it("도메인이 자리 하나뿐이면 항상 1", () => {
        expect(fracToOrd(0.7, 1)).toBe(1);
    });
});
