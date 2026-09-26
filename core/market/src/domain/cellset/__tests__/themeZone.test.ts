// 테마 존 판정 — 테마 단위 AND · 테마 간 ∃(분해 금지), 경쟁 순위, 결손은 결손, 등락 축 순위|값.
// 옛 workbench lib/themeStrength.test 의 이식(2026-09-26 core 이주) + 새 축(값 모드)·파서 이주 잠금.
import { describe, expect, it } from "vitest";
import { buildThemeIndex } from "../../classification/themeMember.js";
import {
    DEFAULT_THEME_ZONE,
    anyThemeCondOn,
    parseThemeZoneParams,
    themeAnswerOf,
    themeProjectionOf,
    themeZoneKeyOf,
    themeZoneVerdicts,
    type ThemeSectionRanks,
    type ThemeZoneParams,
} from "../themeZone.js";

/** 코드 → (등락 서수, 대금 서수[창 적용 끝], 등락 값%). 없는 코드 = 유니버스 밖(null). */
const sectionOf = (ranks: Record<string, [number | null, number | null, (number | null)?]>): ThemeSectionRanks => ({
    ranksOf: (code) => {
        const r = ranks[code];
        return r ? { rateOrd: r[0], amountOrd: r[1], ratePct: r[2] ?? null } : null;
    },
});

const projOf = (members: Record<string, string[]>) =>
    themeProjectionOf(buildThemeIndex(Object.entries(members).flatMap(([theme, codes]) => codes.map((code) => ({ theme, code })))));

const P = (over: Partial<ThemeZoneParams>): ThemeZoneParams => ({ ...DEFAULT_THEME_ZONE, ...over });
const passes = (code: string, s: ThemeSectionRanks, p: ThemeZoneParams, proj: ReturnType<typeof projOf>): boolean =>
    themeAnswerOf(code, s, p, proj).pass;

describe("themeAnswerOf.pass — 테마 단위 AND · 테마 간 ∃", () => {
    it("두 테마가 조건을 나눠 만족하면 불통과한다(분해 금지)", () => {
        const proj = projOf({ A: ["s", "a1", "a2"], B: ["s", "b1"] });
        const section = sectionOf({ s: [10, 10], a1: [5, 5], a2: [3, 3], b1: [50, 50] });
        const both = P({ countOn: true, countMin: 3, baseRankOn: true, baseRankMax: 1 });
        expect(passes("s", section, both, proj)).toBe(false);
        expect(passes("s", section, P({ countOn: true, countMin: 3, baseRankOn: false }), proj)).toBe(true);
        expect(passes("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1 }), proj)).toBe(true);
    });

    it("① 존 종목 수는 자신을 포함해 센다", () => {
        const proj = projOf({ T: ["s", "m1"] });
        const section = sectionOf({ s: [1, 1], m1: [2, 2] });
        expect(passes("s", section, P({ countOn: true, countMin: 2, baseRankOn: false }), proj)).toBe(true);
        expect(passes("s", section, P({ countOn: true, countMin: 3, baseRankOn: false }), proj)).toBe(false);
    });

    it("③ 자신이 존 밖이면 존 순위는 즉시 불만족 — 결손은 결손", () => {
        const proj = projOf({ T: ["s", "m1", "m2"] });
        const section = sectionOf({ s: [99, 99], m1: [1, 1], m2: [2, 2] });
        expect(passes("s", section, P({ countOn: false, zoneRankOn: true, zoneRankMax: 5 }), proj)).toBe(false);
    });

    it("동점은 경쟁 순위(1,1,3) — 같은 서수는 서로를 밀지 않는다", () => {
        const proj = projOf({ T: ["s", "m1", "m2"] });
        const section = sectionOf({ s: [1, 5], m1: [1, 2], m2: [3, 3] });
        expect(passes("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1 }), proj)).toBe(true);
        expect(passes("m2", section, P({ countOn: false, baseRankOn: true, baseRankMax: 2 }), proj)).toBe(false);
    });

    it("결손(null 서수)·유니버스 밖 멤버는 분모·순위를 밀지 않는다", () => {
        const proj = projOf({ T: ["s", "gone", "dead"] });
        const section = sectionOf({ s: [1, 1], dead: [null, null] });
        expect(passes("s", section, P({ countOn: true, countMin: 1, baseRankOn: true, baseRankMax: 1 }), proj)).toBe(true);
        expect(passes("s", section, P({ countOn: true, countMin: 2, baseRankOn: false }), proj)).toBe(false);
    });

    it("활성 조건이 없으면 전부 통과 — 테마 없는 종목 포함. 조건이 있으면 무리가 없어 불통과", () => {
        const proj = projOf({ T: ["m1"] });
        const section = sectionOf({ noTheme: [1, 1] });
        const off = P({ countOn: false, baseRankOn: false, zoneRankOn: false });
        expect(anyThemeCondOn(off)).toBe(false);
        expect(passes("noTheme", section, off, proj)).toBe(true);
        expect(passes("noTheme", section, P({ countOn: true, countMin: 1 }), proj)).toBe(false);
    });

    it("basis=amount 로 바꾸면 순위 조건이 대금 서수를 탄다", () => {
        const proj = projOf({ T: ["s", "m1"] });
        const section = sectionOf({ s: [1, 9], m1: [9, 1] });
        expect(passes("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1, basis: "rate" }), proj)).toBe(true);
        expect(passes("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1, basis: "amount" }), proj)).toBe(false);
    });

    it("등락 **값** 축 — 존이 등락률 %(≥x) ∧ 대금 서수로 선다(순위 축과 독립)", () => {
        const proj = projOf({ T: ["s", "m1"] });
        // s: 등락 서수 99(순위 존 밖)지만 값 +7% — 값 축(≥5%)에선 존 안.
        const section = sectionOf({ s: [99, 1, 7], m1: [98, 2, 6] });
        const byRank = P({ countOn: true, countMin: 2 });
        const byValue = P({ countOn: true, countMin: 2, rate: { mode: "value", minPct: 5 } });
        expect(passes("s", section, byRank, proj)).toBe(false);
        expect(passes("s", section, byValue, proj)).toBe(true);
        // 값이 결손(null)이면 값 축에서 존에 못 든다 — 지어내지 않는다.
        const noVal = sectionOf({ s: [99, 1], m1: [98, 2] });
        expect(passes("s", noVal, byValue, proj)).toBe(false);
    });
});

describe("themeAnswerOf — 존 순위 best·승자 테마(옛 zoneRankAt 의 뜻)", () => {
    it("소속 테마 중 최소 존 순위와 그 테마를 낸다 — 판정과 한 걸음", () => {
        const proj = projOf({ A: ["s", "a1", "a2"], B: ["s", "b1"] });
        const section = sectionOf({ s: [10, 10], a1: [5, 5], a2: [3, 3], b1: [50, 50] });
        const ans = themeAnswerOf("s", section, P({ countOn: true, countMin: 3 }), proj);
        // A 에선 존 3위, B 에선(b1 존 밖) 1위 — best = 1(B).
        expect(ans).toEqual({ pass: true, zoneRank: 1, theme: "B" });
    });

    it("존 밖이면 zoneRank null — 조건 없음이면 pass 는 그래도 true", () => {
        const proj = projOf({ T: ["s", "m1"] });
        const section = sectionOf({ s: [99, 99], m1: [1, 1] });
        const off = P({ countOn: false });
        expect(themeAnswerOf("s", section, off, proj)).toEqual({ pass: true, zoneRank: null, theme: null });
    });
});

describe("themeZoneVerdicts — 표시용 진단(∃ 접기 전) 불변식", () => {
    it("some(pass) 가 themeAnswerOf.pass 와 항상 같다(활성 조건이 있을 때)", () => {
        const proj = projOf({ A: ["s", "a1", "a2"], B: ["s", "b1"] });
        const section = sectionOf({ s: [10, 10, 3], a1: [5, 5, 9], a2: [3, 3, 12], b1: [50, 50, 1] });
        const cases: ThemeZoneParams[] = [
            P({ countOn: true, countMin: 3, baseRankOn: true, baseRankMax: 1 }),
            P({ countOn: true, countMin: 3, baseRankOn: false }),
            P({ countOn: false, baseRankOn: true, baseRankMax: 1 }),
            P({ countOn: false, baseRankOn: false, zoneRankOn: true, zoneRankMax: 1 }),
            P({ countOn: true, countMin: 99 }),
            P({ countOn: true, countMin: 2, rate: { mode: "value", minPct: 5 } }),
        ];
        for (const params of cases) {
            const verdicts = themeZoneVerdicts("s", section, params, proj);
            expect(verdicts.some((v) => v.pass)).toBe(themeAnswerOf("s", section, params, proj).pass);
        }
    });
});

describe("parseThemeZoneParams — 관대한 병합 + 옛 themeStrength 모양 이주", () => {
    it("옛 모양(zoneRateN·zoneAmountWindow 0|60)을 새 축으로 읽는다", () => {
        const p = parseThemeZoneParams({ zoneRateN: 12, zoneAmountN: 25, zoneAmountWindow: 60, basis: "amount", countOn: false, zoneRankOn: true, zoneRankMax: 4 })!;
        expect(p.rate).toEqual({ mode: "rank", max: 12 });
        expect(p.window).toBe(60);
        expect(p.zoneAmountN).toBe(25);
        expect(p.basis).toBe("amount");
        expect(p.zoneRankOn).toBe(true);
        expect(p.zoneRankMax).toBe(4);
        expect(parseThemeZoneParams({ zoneAmountWindow: 0 })!.window).toBeNull();
    });

    it("새 모양 — 값 축·자유 창(클램프), 깨진 유니온은 기본값, 객체 아니면 null", () => {
        const p = parseThemeZoneParams({ rate: { mode: "value", minPct: 4.5 }, window: 30 })!;
        expect(p.rate).toEqual({ mode: "value", minPct: 4.5 });
        expect(p.window).toBe(30);
        expect(parseThemeZoneParams({ window: 99999 })!.window).toBe(600);
        expect(parseThemeZoneParams({ basis: "nasdaq" })!.basis).toBe("rate");
        expect(parseThemeZoneParams("x")).toBeNull();
    });

    it("키 — 같은 파라미터 = 같은 키, 다르면 다르다(셀당 답 캐시의 자)", () => {
        const a = P({});
        expect(themeZoneKeyOf(a)).toBe(themeZoneKeyOf(P({})));
        expect(themeZoneKeyOf(P({ window: 30 }))).not.toBe(themeZoneKeyOf(a));
        expect(themeZoneKeyOf(P({ rate: { mode: "value", minPct: 5 } }))).not.toBe(themeZoneKeyOf(a));
    });
});
