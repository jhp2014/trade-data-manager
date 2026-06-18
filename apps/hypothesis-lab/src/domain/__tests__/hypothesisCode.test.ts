import { describe, expect, it } from "vitest";
import { formatHypothesisCode } from "@/domain/hypothesisCode";

describe("formatHypothesisCode", () => {
    it("4자리로 zero-pad 한다", () => {
        expect(formatHypothesisCode(1)).toBe("H0001");
        expect(formatHypothesisCode(42)).toBe("H0042");
    });

    it("4자리를 넘으면 그대로 확장", () => {
        expect(formatHypothesisCode(12345)).toBe("H12345");
    });

    it("bigint·string 입력도 동일하게 처리", () => {
        expect(formatHypothesisCode(7n)).toBe("H0007");
        expect(formatHypothesisCode("7")).toBe("H0007");
    });
});
