import { describe, it, expect } from "vitest";
import { kstToUnix, addDaysYmd } from "../kst.js";

describe("kstToUnix", () => {
    it("KST 자정 = 전날 15:00 UTC", () => {
        expect(kstToUnix("2026-06-26", "00:00:00")).toBe(Date.UTC(2026, 5, 25, 15, 0, 0) / 1000);
    });
    it("KST 09:00 = 그날 00:00 UTC", () => {
        expect(kstToUnix("2026-06-26", "09:00:00")).toBe(Date.UTC(2026, 5, 26, 0, 0, 0) / 1000);
    });
});

describe("addDaysYmd", () => {
    it("+1 / -1 일", () => {
        expect(addDaysYmd("2026-06-26", 1)).toBe("2026-06-27");
        expect(addDaysYmd("2026-06-26", -1)).toBe("2026-06-25");
    });
    it("월 경계 넘김", () => {
        expect(addDaysYmd("2026-06-30", 1)).toBe("2026-07-01");
        expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    });
});
