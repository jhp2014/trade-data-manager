import { describe, it, expect } from "vitest";
import { isDayCovered, kstDayBounds } from "../archiveCoverage.js";

const cov = (from: string, to: string, channels = 9) => ({ from: new Date(from), to: new Date(to), channels });

describe("isDayCovered", () => {
    // 백필 2023-01-01~ · 어제 20:30 KST 에 sync 완주 = 2026-10-13T11:30Z
    const c = cov("2022-12-31T10:00:00Z", "2026-10-13T11:30:00Z");

    it("완전히 안에 든 날은 참, 오늘(sync 이후)은 거짓, 백필 시작 전은 거짓", () => {
        expect(isDayCovered("2026-10-12", c, 9)).toBe(true);
        expect(isDayCovered("2026-10-13", c, 9)).toBe(false); // 13일 23:59:59 KST > synced_at
        expect(isDayCovered("2022-12-31", c, 9)).toBe(false); // 31일 00:00 KST = 30일 15:00Z < from
        expect(isDayCovered("2023-01-01", c, 9)).toBe(true);
    });

    it("coverage 없음 · 방 수 부족이면 거짓", () => {
        expect(isDayCovered("2026-10-12", null, 9)).toBe(false);
        expect(isDayCovered("2026-10-12", cov("2022-12-31T10:00:00Z", "2026-10-13T11:30:00Z", 8), 9)).toBe(false);
    });

    it("kstDayBounds 는 +09:00 하루 경계", () => {
        expect(kstDayBounds("2026-10-12")).toEqual({
            since: new Date("2026-10-11T15:00:00Z"),
            until: new Date("2026-10-12T14:59:59Z"),
        });
    });
});
