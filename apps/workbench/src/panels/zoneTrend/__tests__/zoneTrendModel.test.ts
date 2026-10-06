// 테마 선 차트 뷰모델 — 모수 = 시선 테마 멤버 ∩ 존(core inThemeZone 동치 — 판정이 어댑터로 스며들면
// 깨진다), 창 T 존과 당일 존의 갈림, 선의 prefix 인과, 시선 겸직 중복 금지, y 자동 맞춤.
import { describe, expect, it } from "vitest";
import { inThemeZone } from "@trade-data-manager/market/domain";
import { kstToUnix } from "../../../lib/derive.js";
import { themeSectionAt } from "../../themeRank/sectionSeries.js";
import { autoYViewOf, DEFAULT_Y_VIEW, trendSampleAt, zoneTrendModelOf } from "../zoneTrendModel.js";
import type { ReplayStock } from "../../../api/dayReplay.js";
import type { ScopeZone } from "../../themeRank/zoneSources.js";

const DATE = "2026-08-14";

const stock = (code: string, bars: [string, number, number][], themes: string[] = ["T"]): ReplayStock => ({
    code, name: code, market: "KRX", marketCap: null, themes,
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

const zoneOf = (p: Pick<ScopeZone, "window" | "zoneAmountN" | "rate">): Pick<ScopeZone, "window" | "zoneAmountN" | "rate"> => p;

describe("zoneTrendModelOf — 멤버십 = 시선 테마 멤버 ∩ 존(core inThemeZone 동치)", () => {
    const stocks = [
        stock("A", [["09:00:00", 1, 100], ["09:10:00", 5, 300]]),
        stock("B", [["09:05:00", 9, 50], ["09:10:00", 2, 900]]),
        stock("C", [["09:00:00", -1, 10], ["09:10:00", -2, 20]]),
        stock("X", [["09:00:00", 8, 800], ["09:10:00", 8, 950]], ["다른테마"]),
    ];
    const zone = zoneOf({ window: null, zoneAmountN: 9, rate: { mode: "rank", max: 9 } });
    const minute = 9 * 60 + 10;

    it("members = (시선 제외) 테마 겹침 ∧ inThemeZone 직접 호출과 같다 — 테마 안 겹치면 존 안이어도 제외", () => {
        const model = zoneTrendModelOf({ stocks, date: DATE, minute, zone, thresholdPt: 2, subjectCode: "A" });
        const sec = themeSectionAt(stocks, DATE, minute, zone.window);
        const subjThemes = new Set(stocks.find((s) => s.code === "A")!.themes);
        const expected = stocks
            .filter((s) => s.code !== "A" && s.themes.some((t) => subjThemes.has(t)))
            .filter((s) => {
                const r = sec.ranksOf(s.code);
                return r !== null && inThemeZone(r, zone);
            })
            .map((s) => s.code);
        expect(model.members.map((m) => m.code)).toEqual(expected);
        expect(expected).not.toContain("X"); // 존 안이어도 테마가 안 겹치면 모수 밖(픽스처가 실제로 가르는지 고정)
        // 시선 A 도 존 안이라 memberCount 에는 든다(겸직 포함).
        expect(model.memberCount).toBe(expected.length + 1);
    });

    it("시선 없음·시선 테마 없음 = 멤버 0(시선 선만)", () => {
        expect(zoneTrendModelOf({ stocks, date: DATE, minute, zone, thresholdPt: 2, subjectCode: null }).members).toEqual([]);
        const bare = [...stocks, stock("N", [["09:00:00", 3, 400]], [])];
        const model = zoneTrendModelOf({ stocks: bare, date: DATE, minute, zone, thresholdPt: 2, subjectCode: "N" });
        expect(model.members).toEqual([]);
        expect(model.memberCount).toBe(0);
        expect(model.subject?.code).toBe("N");
    });

    it("값 축 존(minPct)도 같은 동치 — 음수 등락 테마 동료는 존 밖", () => {
        const vZone = zoneOf({ window: null, zoneAmountN: 9, rate: { mode: "value", minPct: 0 } });
        const model = zoneTrendModelOf({ stocks, date: DATE, minute, zone: vZone, thresholdPt: 2, subjectCode: "A" });
        expect(model.members.map((m) => m.code)).toEqual(["B"]); // C 는 음수 등락, X 는 테마 밖
    });
});

describe("zoneTrendModelOf — 창 T 존 vs 당일 존", () => {
    // A = 아침에 대금 몰림(당일 누적 1위), B = 직전 5분에 몰림(창 1위). 시선 S 는 존 밖(대금 미미).
    const stocks = [
        stock("A", [["09:00:00", 5, 1000], ["09:30:00", 5, 1010]]),
        stock("B", [["09:00:00", 3, 10], ["09:30:00", 3, 500]]),
        stock("S", [["09:00:00", 1, 1], ["09:30:00", 1, 2]]),
    ];
    const minute = 9 * 60 + 30;

    it("당일 존은 A, 5분 창 존은 B 를 집는다", () => {
        const day = zoneTrendModelOf({
            stocks, date: DATE, minute, thresholdPt: 2, subjectCode: "S",
            zone: zoneOf({ window: null, zoneAmountN: 1, rate: { mode: "rank", max: 9 } }),
        });
        const win = zoneTrendModelOf({
            stocks, date: DATE, minute, thresholdPt: 2, subjectCode: "S",
            zone: zoneOf({ window: 5, zoneAmountN: 1, rate: { mode: "rank", max: 9 } }),
        });
        expect(day.members.map((m) => m.code)).toEqual(["A"]);
        expect(win.members.map((m) => m.code)).toEqual(["B"]);
    });
});

describe("zoneTrendModelOf — 선·시선 규칙", () => {
    const stocks = [
        stock("A", [["09:00:00", 1, 100], ["09:05:00", 5, 200], ["09:30:00", 8, 300]]),
        stock("B", [["09:00:00", 2, 50], ["09:05:00", 3, 90]]),
    ];
    const zone = zoneOf({ window: null, zoneAmountN: 9, rate: { mode: "rank", max: 9 } });

    it("멤버 선 꼭짓점은 현재 분을 넘지 않는다(prefix 인과)", () => {
        const minute = 9 * 60 + 5;
        const model = zoneTrendModelOf({ stocks, date: DATE, minute, zone, thresholdPt: 2, subjectCode: "B" });
        expect(model.members.map((m) => m.code)).toEqual(["A"]);
        const a = model.members[0];
        for (const pt of a.pts) expect(pt.x).toBeLessThanOrEqual(minute);
        expect(a.pts[a.pts.length - 1]).toEqual({ x: minute, y: 5 }); // 09:30 샘플(미래)은 안 실린다
    });

    it("시선이 멤버를 겸하면 subject 한 줄만(멤버 목록에서 빠진다) · memberCount 에는 든다", () => {
        const model = zoneTrendModelOf({ stocks, date: DATE, minute: 9 * 60 + 5, zone, thresholdPt: 2, subjectCode: "A" });
        expect(model.subject?.code).toBe("A");
        expect(model.members.map((m) => m.code)).toEqual(["B"]);
        expect(model.memberCount).toBe(2);
    });

    it("스냅샷에 없는 시선 = subject null·멤버 0 · 존 null = 시선 선만", () => {
        const absent = zoneTrendModelOf({ stocks, date: DATE, minute: 600, zone, thresholdPt: 2, subjectCode: "Z" });
        expect(absent.subject).toBeNull();
        expect(absent.members).toEqual([]);
        const noZone = zoneTrendModelOf({ stocks, date: DATE, minute: 600, zone: null, thresholdPt: 2, subjectCode: "A" });
        expect(noZone.members).toEqual([]);
        expect(noZone.memberCount).toBe(0);
        expect(noZone.subject?.code).toBe("A");
    });
});

describe("autoYViewOf — y 자동 맞춤(모수 = 시선 테마 멤버 전체의 하루 전체)", () => {
    const stocks = [stock("A", [["09:00:00", 1, 100], ["10:00:00", 12.4, 300], ["15:00:00", 7, 400]])];

    it("하루 **전체** 최고 기준(현재 분 무관 — 스크럽 중 축이 안 출렁이게)", () => {
        expect(autoYViewOf(stocks, "A")).toEqual({ lo: -3, hi: 15.4 });
    });

    it("테마 동료까지 품는다 — 동료 최고가 시선보다 높으면 상한이 따라오고, 타테마는 무시", () => {
        const sts = [
            ...stocks,
            stock("B", [["09:00:00", 2, 50], ["11:00:00", 24, 900]]),
            stock("X", [["09:00:00", 29, 800]], ["다른테마"]),
        ];
        expect(autoYViewOf(sts, "A")).toEqual({ lo: -3, hi: 27 }); // B(24)+3 — X(29)는 모수 밖
    });

    it("시선 없음·스냅샷 밖이면 기본 창", () => {
        expect(autoYViewOf(stocks, null)).toEqual(DEFAULT_Y_VIEW);
        expect(autoYViewOf(stocks, "Z")).toEqual(DEFAULT_Y_VIEW);
    });

    it("하락 종목 — 하한이 선을 품는다(창 뒤집힘·시선 선 통째 창 밖 방지)", () => {
        const down = [stock("D", [["09:00:00", -2, 100], ["10:00:00", -8, 300], ["15:00:00", -5, 400]])];
        const v = autoYViewOf(down, "D");
        expect(v).toEqual({ lo: -11, hi: 1 }); // lo = 최저(−8) −3 · hi = 최고(−2) +3, lo < hi 보장
        expect(v.lo).toBeLessThan(v.hi);
    });
});

describe("zoneTrendModelOf — 다중 테마 합집합", () => {
    it("시선이 두 테마 소속이면 어느 쪽 동료든 모수다", () => {
        const stocks = [
            stock("S", [["09:00:00", 5, 500]], ["T1", "T2"]),
            stock("P", [["09:00:00", 4, 400]], ["T1"]),
            stock("Q", [["09:00:00", 3, 300]], ["T2"]),
            stock("R", [["09:00:00", 2, 200]], ["T3"]),
        ];
        const model = zoneTrendModelOf({
            stocks, date: DATE, minute: 9 * 60, thresholdPt: 2, subjectCode: "S",
            zone: zoneOf({ window: null, zoneAmountN: 9, rate: { mode: "rank", max: 9 } }),
        });
        expect(model.members.map((m) => m.code).sort()).toEqual(["P", "Q"]);
    });
});

describe("trendSampleAt — 크로스헤어 실값", () => {
    const stocks = [stock("A", [["09:00:00", 1, 100], ["09:05:00", 5, 300]])];

    it("정확한 분 = 그 샘플, 사이 분 = carry-forward 등락 + 분당 대금은 모름(null)", () => {
        expect(trendSampleAt(stocks, "A", 9 * 60)).toEqual({ rate: 1, amount: 100 });
        // 09:05 — 직전 분(09:04) 결손이라 차분이 여러 분의 합 → 모름.
        expect(trendSampleAt(stocks, "A", 9 * 60 + 5)).toEqual({ rate: 5, amount: null });
        // 09:03 — 샘플 없음: 등락은 carry-forward(1), 분당 대금은 모름.
        expect(trendSampleAt(stocks, "A", 9 * 60 + 3)).toEqual({ rate: 1, amount: null });
        expect(trendSampleAt(stocks, "A", 8 * 60)).toBeNull(); // 첫 샘플 전
        expect(trendSampleAt(stocks, "Z", 600)).toBeNull(); // 유니버스 밖
    });
});
