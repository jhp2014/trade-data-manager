// 날짜 고르기 판의 순수부 — 연/월/일 색인 · "가장 가까운 것" 보정 · 월~금 격자 · 휴장 판정을 잠근다.
import { describe, expect, it } from "vitest";
import { dayKindOf, indexDates, monthGridOf, nearestOf } from "../DateCalendar.js";

const DATES = ["2025-12-30", "2026-01-02", "2026-01-05", "2026-09-22", "2026-09-28"];

describe("indexDates", () => {
    it("연 → 월 → 날짜들로 색인한다(입력 순서 유지 — 오름차순 전제)", () => {
        const idx = indexDates(DATES);
        expect([...idx.keys()]).toEqual(["2025", "2026"]);
        expect([...idx.get("2026")!.keys()]).toEqual(["01", "09"]);
        expect(idx.get("2026")!.get("09")).toEqual(["2026-09-22", "2026-09-28"]);
    });

    it("빈 목록 = 빈 색인", () => {
        expect(indexDates([]).size).toBe(0);
    });
});

describe("nearestOf — 연을 바꿔도 보던 달 근처에 머문다", () => {
    it("있으면 그대로, 없으면 숫자로 가장 가까운 것", () => {
        expect(nearestOf(["01", "09"], "09")).toBe("09");
        expect(nearestOf(["01", "09"], "06")).toBe("09");
        expect(nearestOf(["01", "09"], "04")).toBe("01");
        expect(nearestOf(["12"], "01")).toBe("12");
    });

    it("빈 목록이면 원하는 값 그대로(호출부가 빈 줄을 그린다)", () => {
        expect(nearestOf([], "09")).toBe("09");
    });
});

describe("monthGridOf — 월~금 5열, 주말은 건너뛴다", () => {
    it("1일이 월요일인 달(2026-06) — 첫 줄이 꽉 찬다", () => {
        const g = monthGridOf("2026-06");
        expect(g[0]).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
        expect(g[g.length - 1]).toEqual(["2026-06-29", "2026-06-30", null, null, null]);
        expect(g).toHaveLength(5);
    });

    it("1일이 목요일인 달(2026-10) — 첫 줄 앞이 비고, 둘째 줄이 월요일부터", () => {
        const g = monthGridOf("2026-10");
        expect(g[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02"]);
        expect(g[1]![0]).toBe("2026-10-05");
    });

    it("1일이 토요일인 달(2026-08) — 빈 줄 없이 3일(월)부터", () => {
        const g = monthGridOf("2026-08");
        expect(g[0]).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
        expect(g.flat().filter((d) => d !== null)).toHaveLength(21);
    });
});

describe("dayKindOf — 휴장 = 데이터 구간 안에서 빠진 평일", () => {
    const trading = new Set(["2026-06-01", "2026-06-02", "2026-06-04"]);
    it("구간 안의 빠진 날은 휴장, 구간 밖은 데이터 없음", () => {
        expect(dayKindOf("2026-06-02", trading, "2026-06-01", "2026-06-04")).toBe("trading");
        expect(dayKindOf("2026-06-03", trading, "2026-06-01", "2026-06-04")).toBe("holiday");
        expect(dayKindOf("2026-06-05", trading, "2026-06-01", "2026-06-04")).toBe("outside");
        expect(dayKindOf("2026-05-29", trading, "2026-06-01", "2026-06-04")).toBe("outside");
    });
    it("거래일 목록이 비면 전부 구간 밖", () => {
        expect(dayKindOf("2026-06-03", new Set(), undefined, undefined)).toBe("outside");
    });
});
