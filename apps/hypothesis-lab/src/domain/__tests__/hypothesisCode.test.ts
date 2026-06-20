import { describe, expect, it } from "vitest";
import { formatHypothesisCode } from "@/domain/hypothesisCode";

describe("formatHypothesisCode", () => {
    it("패딩 없이 id 를 그대로 표기한다", () => {
        expect(formatHypothesisCode(1)).toBe("H1");
        expect(formatHypothesisCode(42)).toBe("H42");
        expect(formatHypothesisCode(12345)).toBe("H12345");
    });

    it("bigint·string 입력도 동일하게 처리", () => {
        expect(formatHypothesisCode(7n)).toBe("H7");
        expect(formatHypothesisCode("7")).toBe("H7");
    });
});
