import { describe, expect, it } from "vitest";
import { runningMaxRateAt, runningMaxRateTrackAt } from "../sectionSeries.js";
import type { ReplayStock } from "../../../api/dayReplay.js";

// KST 분 → unix 초 — minuteOfDayOf 의 역(KST_OFFSET 9h). 하루를 더해 음수를 피한다(m*60 < 32400 구간).
const t = (m: number): number => 86400 + m * 60 - 9 * 3600;

/** 최소 재료 스텁 — running max 는 code/times/rate 만 읽는다(타입은 통째라 캐스팅). */
const stock = (code: string, bars: [min: number, rate: number][]): ReplayStock =>
    ({ code, times: bars.map(([m]) => t(m)), rate: bars.map(([, r]) => r) } as unknown as ReplayStock);

const DATE = "2026-10-02";

describe("runningMaxRateTrackAt — 등락 값 축 자동맞춤의 재료", () => {
    const stocks = [
        stock("A", [[540, 1], [541, 3], [545, 2]]),
        stock("B", [[542, 7], [550, 5]]),
        stock("OUT", [[540, 29]]), // 집합 밖 — 무시돼야 한다
    ];
    const codes = new Set(["A", "B"]);
    const key = "A,B";

    it("현재 분까지의 최고 — 단조 비감소, 집합 밖 종목 무시", () => {
        const track = runningMaxRateTrackAt(stocks, DATE, key, codes);
        expect(runningMaxRateAt(track, 540)).toBe(1);
        expect(runningMaxRateAt(track, 541)).toBe(3);
        expect(runningMaxRateAt(track, 542)).toBe(7); // B 합류 — OUT(29)은 안 끼었다
        expect(runningMaxRateAt(track, 1439)).toBe(7);
        let prev = Number.NEGATIVE_INFINITY;
        for (let m = 0; m < 1440; m += 7) {
            const v = runningMaxRateAt(track, m) ?? Number.NEGATIVE_INFINITY;
            expect(v).toBeGreaterThanOrEqual(prev);
            prev = v;
        }
    });

    it("첫 봉 전은 null(지어내지 않는다) · 되감으면 작은 값(미래 누설 없음)", () => {
        const track = runningMaxRateTrackAt(stocks, DATE, key, codes);
        expect(runningMaxRateAt(track, 0)).toBeNull();
        expect(runningMaxRateAt(track, 539)).toBeNull();
        expect(runningMaxRateAt(track, 544)).toBe(7);
        expect(runningMaxRateAt(track, 540)).toBe(1); // 되감기 — 그 시점까지만
    });

    it("같은 (스냅샷, 키)는 같은 참조(캐시), 다른 키는 새 트랙", () => {
        const a = runningMaxRateTrackAt(stocks, DATE, key, codes);
        const b = runningMaxRateTrackAt(stocks, DATE, key, codes);
        expect(b).toBe(a);
        const c = runningMaxRateTrackAt(stocks, DATE, "A", new Set(["A"]));
        expect(c).not.toBe(a);
        expect(runningMaxRateAt(c, 600)).toBe(3);
    });
});
