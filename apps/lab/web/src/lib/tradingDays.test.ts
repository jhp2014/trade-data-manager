import { describe, expect, it } from "vitest";
import { initialView, monthForYear, monthsByYear } from "./tradingDays.js";

const DAYS = ["2025-12-30", "2026-01-02", "2026-01-05", "2026-07-30", "2026-07-31", "2026-08-03"];

describe("initialView", () => {
    it("날짜가 있으면 그 달, 없으면 최신 거래일의 달, 목록이 비면 null", () => {
        expect(initialView(DAYS, "2026-01-05")).toEqual({ year: "2026", month: "01" });
        expect(initialView(DAYS, "")).toEqual({ year: "2026", month: "08" });
        expect(initialView([], "")).toBeNull();
    });
});

describe("monthForYear", () => {
    const by = monthsByYear(DAYS);
    it("년마다 거래일 있는 월", () => {
        expect([...by.get("2026")!]).toEqual(["01", "07", "08"]);
        expect([...by.get("2025")!]).toEqual(["12"]);
    });
    it("같은 월이 있으면 그대로, 없으면 그 해의 가장 늦은 월", () => {
        expect(monthForYear(by.get("2026"), "07")).toBe("07");
        expect(monthForYear(by.get("2025"), "07")).toBe("12");
    });
});
