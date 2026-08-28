import { describe, it, expect } from "vitest";
import { kstToUnix } from "../../../lib/derive.js";
import { scrubSectionOf } from "../scrubSection.js";
import { bandSegmentsOf, subjectOrdinalTrack } from "../zoneTrack.js";
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

// A 는 09:00 부터, B 는 09:02 부터 참가 — B 참가 후 A 의 대금 서수가 2위로 밀린다.
const stocks = [
    stock("A", [["09:00:00", 5, 100]]),
    stock("B", [["09:02:00", 9, 900]]),
];
const RANGE = { lo: 9 * 60, hi: 9 * 60 + 4 };

describe("subjectOrdinalTrack — 분당 서수(core rankSectionOf 위임)", () => {
    it("scrubSectionOf 직접 호출과 완전 동치 — 서수 출처가 둘이 되지 않는다", () => {
        const track = subjectOrdinalTrack(stocks, DATE, "A", RANGE);
        for (let m = RANGE.lo; m <= RANGE.hi; m++) {
            const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
            const r = scrubSectionOf(stocks, DATE, hhmm).ranksOf("A");
            expect(track.get(m)).toEqual(r === null || r.rate === null ? undefined : r);
        }
    });

    it("참가 전 분은 키가 없다 — 결손을 지어내지 않는다", () => {
        const track = subjectOrdinalTrack(stocks, DATE, "B", RANGE);
        expect(track.get(RANGE.lo)).toBeUndefined(); // 09:00 — B 는 아직 시작 전
        expect(track.get(9 * 60 + 2)).toEqual({ rate: 1, amount: 1 }); // 등락 9 = 1위, 대금 900 = 1위
    });
});

describe("bandSegmentsOf — 재적 구간(끊김 = 이탈/결손)", () => {
    it("연속 재적을 한 구간으로 접고, 이탈 분에서 끊는다", () => {
        // A: 09:00~01 은 (1,1), 09:02 부터 대금 2위(B 900 참가) → M=1 이면 09:02 에 이탈.
        const track = subjectOrdinalTrack(stocks, DATE, "A", RANGE);
        expect(bandSegmentsOf(track, RANGE.lo, RANGE.hi, 5, 1)).toEqual([{ from: 540, to: 541 }]);
        // 컷을 늘리면(M=2) 하루 전체가 한 구간.
        expect(bandSegmentsOf(track, RANGE.lo, RANGE.hi, 5, 2)).toEqual([{ from: 540, to: 544 }]);
    });

    it("결손 분(트랙에 없음)은 재적이 아니다", () => {
        const track = subjectOrdinalTrack(stocks, DATE, "B", RANGE);
        expect(bandSegmentsOf(track, RANGE.lo, RANGE.hi, 9, 9)).toEqual([{ from: 542, to: 544 }]); // 09:00~01 결손
    });

    it("아무 데도 안 들면 빈 배열", () => {
        const track = subjectOrdinalTrack(stocks, DATE, "A", RANGE);
        expect(bandSegmentsOf(track, RANGE.lo, RANGE.hi, 0, 0)).toEqual([]);
    });
});
