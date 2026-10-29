import { describe, expect, it } from "vitest";
import { addDays, dateLabel, kstDateOfIso, kstHmOfIso, shiftYears, weekdayKo } from "./date.js";
import { dailyRowsOf, type DailyPage } from "../market/queries.js";
import type { InfiniteData } from "@tanstack/react-query";

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

describe("날짜 계산", () => {
    it("shiftYears — 2/29 는 없는 해에서 3/1", () => {
        expect(shiftYears("2026-07-31", -2)).toBe("2024-07-31");
        expect(shiftYears("2024-02-29", -2)).toBe("2022-03-01");
    });
    it("일봉 덩이 경계는 겹치지도 비지도 않는다 — 다음 덩이의 끝 = 이번 시작의 하루 앞", () => {
        const from = shiftYears("2026-07-31", -2);
        expect(addDays(from, -1)).toBe("2024-07-30");
    });
});

describe("dailyRowsOf", () => {
    it("최근부터 쌓인 덩이를 날짜 오름차순 하나로", () => {
        const row = (date: string) => ({ stockCode: "1", date }) as never;
        const page = (from: string, to: string, dates: string[]): DailyPage => ({ from, to, rows: dates.map(row) });
        const data: InfiniteData<DailyPage, string> = {
            pages: [page("2024-07-31", "2026-07-31", ["2025-01-02", "2026-07-31"]), page("2022-07-31", "2024-07-30", ["2023-01-02"])],
            pageParams: ["2026-07-31", "2024-07-30"],
        };
        expect(dailyRowsOf(data).map((r) => r.date)).toEqual(["2023-01-02", "2025-01-02", "2026-07-31"]);
        expect(dailyRowsOf(undefined)).toEqual([]);
    });
});
