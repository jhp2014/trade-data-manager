// 거래일 이동 판의 순수부 — 연/월/일 색인과 "가장 가까운 것" 보정을 잠근다.
import { describe, expect, it } from "vitest";
import { indexDates, nearestOf } from "../DateJumpMenu.js";

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
