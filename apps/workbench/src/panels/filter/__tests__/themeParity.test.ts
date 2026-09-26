// 이주 동치 게이트(임시 — a6 에서 옛 판정과 함께 삭제) — 옛 themeStrength(passesPoint, amount|amount60
// 이지선다)와 새 core themeZone(themeAnswerOf, 창 적용 끝난 단면)이 같은 입력에서 같은 답을 낸다.
// 두 판정이 공존하는 이주 구간의 안전줄이다(planner 위험 3).
import { describe, expect, it } from "vitest";
import { buildThemeIndex, parseThemeZoneParams, themeAnswerOf, themeProjectionOf, type ThemeSectionRanks } from "@trade-data-manager/market/domain";
import { DEFAULT_THEME_STRENGTH, passesPoint, type SectionRanks, type ThemeStrengthParams } from "../../../lib/themeStrength.js";

type Row = { rate: number | null; amount: number | null; amount60: number | null };

const projOf = (members: Record<string, string[]>) =>
    themeProjectionOf(buildThemeIndex(Object.entries(members).flatMap(([theme, codes]) => codes.map((code) => ({ theme, code })))));

/** 옛 단면과 새 단면을 **같은 행**에서 만든다 — 창이 60이면 새 단면의 amountOrd = amount60. */
const sections = (rows: Record<string, Row>, window: 0 | 60): { oldSec: SectionRanks; newSec: ThemeSectionRanks } => ({
    oldSec: { ranksOf: (c) => rows[c] ?? null },
    newSec: {
        ranksOf: (c) => {
            const r = rows[c];
            return r ? { rateOrd: r.rate, ratePct: null, amountOrd: window === 60 ? r.amount60 : r.amount } : null;
        },
    },
});

const CASES: Partial<ThemeStrengthParams>[] = [
    {},
    { countOn: true, countMin: 2 },
    { countOn: true, countMin: 3, baseRankOn: true, baseRankMax: 1 },
    { countOn: false, zoneRankOn: true, zoneRankMax: 2 },
    { countOn: false, baseRankOn: true, baseRankMax: 1, basis: "amount" },
    { countOn: true, countMin: 2, zoneAmountWindow: 60 },
    { countOn: false, baseRankOn: false, zoneRankOn: false },
];

describe("옛 themeStrength ≡ 새 themeZone (파라미터 이주 사상 포함)", () => {
    const proj = projOf({ A: ["s", "a1", "a2"], B: ["s", "b1"], C: ["only"] });
    const rows: Record<string, Row> = {
        s: { rate: 10, amount: 10, amount60: 50 },
        a1: { rate: 5, amount: 5, amount60: 1 },
        a2: { rate: 3, amount: 3, amount60: 2 },
        b1: { rate: 50, amount: 50, amount60: 3 },
        only: { rate: 1, amount: 1, amount60: 4 },
        dead: { rate: null, amount: null, amount60: null },
    };

    it("전 케이스 × 전 종목에서 pass 가 같다", () => {
        for (const over of CASES) {
            const oldP: ThemeStrengthParams = { ...DEFAULT_THEME_STRENGTH, ...over };
            // 이주 = 옛 payload 를 core 파서에 그대로 — zoneRateN → rate rank, 0|60 → null|60.
            const newP = parseThemeZoneParams(oldP)!;
            const { oldSec, newSec } = sections(rows, oldP.zoneAmountWindow);
            for (const code of ["s", "a1", "b1", "only", "noTheme", "dead"]) {
                expect(themeAnswerOf(code, newSec, newP, proj).pass, `${JSON.stringify(over)} · ${code}`)
                    .toBe(passesPoint(code, oldSec, oldP, proj));
            }
        }
    });
});
