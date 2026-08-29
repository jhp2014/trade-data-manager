import { describe, it, expect } from "vitest";
import { buildThemeIndex } from "@trade-data-manager/market/domain";
import {
    DEFAULT_THEME_STRENGTH, countPassing, parseThemeStrengthParams, passesPoint,
    themeProjectionOf, type SectionRanks, type ThemeStrengthParams,
} from "../themeStrength.js";

/** 코드 → (등락 서수, 대금 서수). 없는 코드 = 유니버스 밖(null). */
const sectionOf = (ranks: Record<string, [number | null, number | null]>): SectionRanks => ({
    ranksOf: (code) => {
        const r = ranks[code];
        return r ? { rate: r[0], amount: r[1] } : null;
    },
});

const projOf = (members: Record<string, string[]>) =>
    themeProjectionOf(buildThemeIndex(Object.entries(members).flatMap(([theme, codes]) => codes.map((code) => ({ theme, code })))));

const P = (over: Partial<ThemeStrengthParams>): ThemeStrengthParams => ({ ...DEFAULT_THEME_STRENGTH, ...over });

describe("passesPoint — 테마 단위 AND · 테마 간 ∃", () => {
    // A테마는 동료 수만, B테마는 순위만 만족 — 어느 한 테마도 둘 다는 못 채우면 **불통과**(분해 금지).
    it("두 테마가 조건을 나눠 만족하면 불통과한다", () => {
        const proj = projOf({ A: ["s", "a1", "a2"], B: ["s", "b1"] });
        const section = sectionOf({
            s: [10, 10], // 존 안(30/40), A·B 소속
            a1: [5, 5], a2: [3, 3], // A: 존 종목수 3(자신 포함) — 단 s 는 A 에서 3위(꼴찌)
            b1: [50, 50], // B: 존 종목수 1 — s 가 B 에선 기본 순위 1위
        });
        const both = P({ countOn: true, countMin: 3, baseRankOn: true, baseRankMax: 1 });
        // A: count 3 ✓, 기본순위 3 ✗ / B: count 1 ✗, 기본순위 1 ✓ → 나눠 만족 = 불통과
        expect(passesPoint("s", section, both, proj)).toBe(false);
        // 조건을 하나로 줄이면 각자 통과한다(묶음이 문제였음을 확인)
        expect(passesPoint("s", section, P({ countOn: true, countMin: 3, baseRankOn: false }), proj)).toBe(true);
        expect(passesPoint("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1 }), proj)).toBe(true);
    });

    it("① 존 종목 수는 자신을 포함해 센다", () => {
        const proj = projOf({ T: ["s", "m1"] });
        const section = sectionOf({ s: [1, 1], m1: [2, 2] });
        expect(passesPoint("s", section, P({ countOn: true, countMin: 2, baseRankOn: false }), proj)).toBe(true);
        expect(passesPoint("s", section, P({ countOn: true, countMin: 3, baseRankOn: false }), proj)).toBe(false);
    });

    it("③ 자신이 존 밖이면 존 순위는 즉시 불만족 — 결손은 결손", () => {
        const proj = projOf({ T: ["s", "m1", "m2"] });
        const section = sectionOf({ s: [99, 99], m1: [1, 1], m2: [2, 2] }); // s 존 밖(30/40)
        expect(passesPoint("s", section, P({ countOn: false, zoneRankOn: true, zoneRankMax: 5 }), proj)).toBe(false);
    });

    it("동점은 경쟁 순위(1,1,3) — 같은 서수는 서로를 밀지 않는다", () => {
        const proj = projOf({ T: ["s", "m1", "m2"] });
        // 기준(등락) 서수: s=1, m1=1(동점), m2=3
        const section = sectionOf({ s: [1, 5], m1: [1, 2], m2: [3, 3] });
        expect(passesPoint("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1 }), proj)).toBe(true); // 동점 1위
        expect(passesPoint("m2", section, P({ countOn: false, baseRankOn: true, baseRankMax: 2 }), proj)).toBe(false); // m2 는 3위
    });

    it("결손(null 서수)·유니버스 밖 멤버는 분모·순위를 밀지 않는다", () => {
        const proj = projOf({ T: ["s", "gone", "dead"] });
        const section = sectionOf({ s: [1, 1], dead: [null, null] }); // gone 은 유니버스 밖
        expect(passesPoint("s", section, P({ countOn: true, countMin: 1, baseRankOn: true, baseRankMax: 1 }), proj)).toBe(true);
        expect(passesPoint("s", section, P({ countOn: true, countMin: 2, baseRankOn: false }), proj)).toBe(false); // 존 안은 s 뿐
    });

    it("활성 조건이 없으면 전부 통과(조건 없음 = 필터 없음) — 테마 없는 종목 포함", () => {
        const proj = projOf({ T: ["m1"] });
        const section = sectionOf({ noTheme: [1, 1] });
        const off = P({ countOn: false, baseRankOn: false, zoneRankOn: false });
        expect(passesPoint("noTheme", section, off, proj)).toBe(true);
        // 조건이 있으면 테마 없는 종목은 만족할 무리가 없다
        expect(passesPoint("noTheme", section, P({ countOn: true, countMin: 1 }), proj)).toBe(false);
    });

    it("basis=amount 로 바꾸면 순위 조건이 거래대금 서수를 탄다", () => {
        const proj = projOf({ T: ["s", "m1"] });
        const section = sectionOf({ s: [1, 9], m1: [9, 1] }); // s 는 등락 1위·대금 꼴찌
        expect(passesPoint("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1, basis: "rate" }), proj)).toBe(true);
        expect(passesPoint("s", section, P({ countOn: false, baseRankOn: true, baseRankMax: 1, basis: "amount" }), proj)).toBe(false);
    });
});

describe("parseThemeStrengthParams — 관대한 병합(옛 저장물이 통째로 죽지 않게)", () => {
    it("깨진 basis 유니온은 기본값, 빠진 필드는 기본값이 채운다(전용 가드 — mergeShape 는 string 까지만 본다)", () => {
        const p = parseThemeStrengthParams({ zoneRateN: 12, basis: "nasdaq" })!;
        expect(p.zoneRateN).toBe(12);
        expect(p.basis).toBe("rate");
        expect(p.zoneAmountN).toBe(40);
    });

    it("객체가 아니면 null", () => {
        expect(parseThemeStrengthParams("x")).toBeNull();
        expect(parseThemeStrengthParams(null)).toBeNull();
    });
});

describe("countPassing — 3항(통과/판정가능/결손)", () => {
    it("단면 없는 타점은 결손으로 갈라 세고 불통과에 섞지 않는다", () => {
        const proj = projOf({ T: ["s", "m1"] });
        const section = sectionOf({ s: [1, 1], m1: [2, 2] });
        const points = [
            { stockCode: "s", date: "2026-08-14", time: "09:30:00" },
            { stockCode: "s", date: "2026-08-28", time: "09:30:00" }, // pending — 단면 없음
        ];
        const out = countPassing(points, (d) => (d === "2026-08-14" ? section : null), P({ countOn: true, countMin: 2 }), proj);
        expect(out).toEqual({ passed: 1, evaluable: 1, missing: 1 });
    });
});
