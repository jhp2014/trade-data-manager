import { describe, expect, it } from "vitest";
import { fmtPriceAxis } from "./chartUtils.js";

describe("가격 축 표기", () => {
    it("천 단위 쉼표, 정수", () => {
        expect(fmtPriceAxis(123456)).toBe("123,456");
        expect(fmtPriceAxis(1234567.6)).toBe("1,234,568");
        expect(fmtPriceAxis(950)).toBe("950");
    });
});
