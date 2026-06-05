import { describe, it, expect } from "vitest";
import { kstHHmm, kstYmd } from "../chartTime";

// KST 2026-05-11 09:30:00 = 2026-05-11T00:30:00Z → epoch sec = 1778459400
const SAMPLE_SEC = Math.floor(Date.UTC(2026, 4, 11, 0, 30, 0) / 1000);

describe("chartTime (KST helpers)", () => {
    it("kstHHmm: UTC 09:30(=KST 18:30) 분 단위 포맷", () => {
        expect(kstHHmm(SAMPLE_SEC)).toBe("09:30");
    });

    it("kstYmd: 날짜 포맷", () => {
        expect(kstYmd(SAMPLE_SEC)).toBe("2026-05-11");
    });

    it("한 자리 월/일/시/분은 0으로 패딩", () => {
        // KST 2026-01-02 03:04:00 = UTC 2026-01-01T18:04:00Z
        const sec = Math.floor(Date.UTC(2026, 0, 1, 18, 4, 0) / 1000);
        expect(kstYmd(sec)).toBe("2026-01-02");
        expect(kstHHmm(sec)).toBe("03:04");
    });
});
