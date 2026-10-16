import { describe, expect, it } from "vitest";
import { isAfterPath } from "./pathTime.js";

describe("isAfterPath — 경로 시각보다 나중(사후 정보)", () => {
    it("같은 분은 이미 아는 것, 다음 분부터 나중", () => {
        expect(isAfterPath("2026-07-31", "10:00:59", "2026-07-31", "10:00")).toBe(false);
        expect(isAfterPath("2026-07-31", "10:01", "2026-07-31", "10:00")).toBe(true);
    });
    it("날짜를 넘어서도 — 다음 날은 전부 나중, 전날은 전부 앎", () => {
        expect(isAfterPath("2026-07-31", "08:00", "2026-07-30", "15:00")).toBe(true);
        expect(isAfterPath("2026-07-29", "23:00", "2026-07-30", "09:00")).toBe(false);
    });
    it("경로에 시각이 없으면 가르지 않는다", () => {
        expect(isAfterPath("2026-07-31", "15:00", "2026-07-30", "")).toBe(false);
    });
});
