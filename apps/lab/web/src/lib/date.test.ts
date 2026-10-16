import { describe, expect, it } from "vitest";
import { dateLabel, kstDateOfIso, kstHmOfIso, weekdayKo } from "./date.js";

describe("날짜 표기", () => {
    it("요일", () => {
        expect(weekdayKo("2026-07-31")).toBe("금");
        expect(dateLabel("2026-07-31")).toBe("2026-07-31 (금)");
    });
    it("ISO → KST — UTC 로 전날이어도 KST 날짜·시각", () => {
        expect(kstDateOfIso("2026-07-30T23:30:00Z")).toBe("2026-07-31");
        expect(kstHmOfIso("2026-07-30T23:30:00Z")).toBe("08:30");
    });
    it("읽을 수 없는 시각은 빈 글자(던지지 않는다)", () => {
        expect(kstDateOfIso("")).toBe("");
        expect(kstHmOfIso("깨짐")).toBe("");
    });
});
