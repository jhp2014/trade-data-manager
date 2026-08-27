import { describe, it, expect } from "vitest";
import { rankSectionOf } from "@trade-data-manager/market/domain";
import { kstToUnix } from "../../../lib/derive.js";
import { defaultMinuteOf, scrubSectionOf } from "../scrubSection.js";
import type { ReplayStock } from "../../../api/dayReplay.js";

const DATE = "2026-08-14";

const stock = (code: string, bars: [string, number, number][]): ReplayStock => ({
    code, name: code, market: "KRX", marketCap: null, themes: [],
    times: bars.map(([t]) => kstToUnix(DATE, t)),
    rate: bars.map(([, r]) => r),
    high: bars.map(([, r]) => r),
    low: bars.map(([, r]) => r),
    open: 0,
    cumAmount: bars.map(([, , a]) => a),
    minuteOpen: bars.map(([, r]) => r),
    minuteHigh: bars.map(([, r]) => r),
    minuteLow: bars.map(([, r]) => r),
    trailingHighs: { krx: [], un: [] },
    basePrice: { krx: null, un: null },
});

describe("defaultMinuteOf — 빈 화면을 만들지 않는 사다리", () => {
    it("타점 시각 → 그날 첫 타점 → 마지막 봉 순으로 물러난다", () => {
        expect(defaultMinuteOf("09:31:00", ["10:00:00"], 900)).toBe(9 * 60 + 31);
        expect(defaultMinuteOf(null, ["10:00:00", "11:00:00"], 900)).toBe(600);
        expect(defaultMinuteOf(null, [], 900)).toBe(900);
        expect(defaultMinuteOf(null, [], null)).toBeNull(); // 스냅샷조차 없으면 그때만 null
    });
});

describe("scrubSectionOf — core 위임 어댑터(자체 계산 0)", () => {
    const stocks = [
        stock("A", [["09:00:00", 1, 100], ["09:10:00", 5, 300]]),
        stock("B", [["09:05:00", 9, 50], ["09:10:00", 2, 900]]),
    ];

    it("결과가 rankSectionOf 직접 호출과 **완전 동치**다 — 어댑터에 규칙이 스며들면 여기서 깨진다", () => {
        for (const t of ["09:00", "09:07", "09:10", "15:40"]) {
            expect(scrubSectionOf(stocks, DATE, t).section).toEqual(rankSectionOf(stocks, DATE, t));
        }
    });

    it("carry-forward·결손이 core 규칙대로다", () => {
        const s = scrubSectionOf(stocks, DATE, "09:00");
        expect(s.ranksOf("A")).toEqual({ rate: 1, amount: 1 });
        expect(s.ranksOf("B")).toEqual({ rate: null, amount: null }); // 아직 시작 전 = 결손
        expect(s.ranksOf("Z")).toBeNull(); // 유니버스 밖
        expect(scrubSectionOf(stocks, DATE, "09:07").section.n).toBe(2); // B 가 09:05 값으로 참가
    });
});
