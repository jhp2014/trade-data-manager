import { describe, it, expect } from "vitest";
import { parseUniverse } from "../universe.js";

// 우주 개념은 2026-09-26 종단 폐기로 은퇴 — 남은 것은 이주(종단 집합 폐기)가 읽는 승계 규칙 하나다.
describe("parseUniverse — 부재·오염은 종단(이주가 그 집합을 폐기한다)", () => {
    it("daily 만 daily", () => {
        expect(parseUniverse("daily")).toBe("daily");
        expect(parseUniverse(undefined)).toBe("longitudinal");
        expect(parseUniverse("쓰레기")).toBe("longitudinal");
    });
});
