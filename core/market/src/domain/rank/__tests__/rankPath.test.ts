import { describe, it, expect } from "vitest";
import { entryAnchoredBars, type AnchorBar } from "../rankPath.js";

const bar = (time: string, close: string, high = close, low = close): AnchorBar => ({ time, close, high, low });

describe("entryAnchoredBars", () => {
    it("진입 바(진입 time 이상 첫 분봉) UN 종가를 앵커로 % 환산", () => {
        const bars = [bar("09:00:00", "100"), bar("09:01:00", "110", "120", "105"), bar("09:02:00", "99")];
        const out = entryAnchoredBars(bars, "09:01:00");
        expect(out).toEqual([
            { t: -1, close: (100 - 110) / 110 * 100, high: (100 - 110) / 110 * 100, low: (100 - 110) / 110 * 100 },
            { t: 0, close: 0, high: (120 - 110) / 110 * 100, low: (105 - 110) / 110 * 100 },
            { t: 1, close: (99 - 110) / 110 * 100, high: (99 - 110) / 110 * 100, low: (99 - 110) / 110 * 100 },
        ]);
    });

    it("진입 time 과 정확히 같은 분봉이 없으면 그 이상 첫 분봉이 앵커(t=0)", () => {
        const bars = [bar("09:00:00", "100"), bar("09:05:00", "200")];
        const out = entryAnchoredBars(bars, "09:03:00");
        expect(out[0]).toEqual({ t: -3, close: (100 - 200) / 200 * 100, high: (100 - 200) / 200 * 100, low: (100 - 200) / 200 * 100 });
        expect(out[1].t).toBe(2);
        expect(out[1].close).toBe(0);
    });

    it("진입 바가 없으면(모든 분봉이 진입 time 미만) 빈 배열", () => {
        expect(entryAnchoredBars([bar("09:00:00", "100")], "10:00:00")).toEqual([]);
    });

    it("앵커가 0/부재면 빈 배열", () => {
        expect(entryAnchoredBars([bar("09:00:00", "0")], "09:00:00")).toEqual([]);
        expect(entryAnchoredBars([], "09:00:00")).toEqual([]);
    });
});
