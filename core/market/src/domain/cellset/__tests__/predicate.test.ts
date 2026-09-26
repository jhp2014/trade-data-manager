import { describe, it, expect } from "vitest";
import {
    breakoutKeyOf,
    breakoutStructKeyOf,
    costTierOf,
    isCellPredicateEmpty,
    parseCellConditions,
    parseCellPredicate,
    unknownCellPredicate,
    usesGridPoint,
    usesTheme,
    type CellConditions,
    type CellPredicate,
} from "../predicate.js";
import { DEFAULT_THEME_ZONE } from "../themeZone.js";

// 파서는 panelUi(무검증 JSON 가방)의 유일한 문지기다 — 여기가 뚫리면 깨진 blob 이 평가기까지 간다.

describe("parseCellPredicate", () => {
    it("네 종류를 왕복한다(전이 포함)", () => {
        const preds = [
            { kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }], transition: "firstOfDay" },
            { kind: "priorHighBreak", days: 20 },
            { kind: "gridPoint", transition: "firstTrue" },
            { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] },
        ];
        for (const p of preds) expect(parseCellPredicate(JSON.parse(JSON.stringify(p)))).toEqual(p);
    });

    it("옛 존순위 셀 값(zoneRank) → theme 이주 — 값 상한·전이 보존", () => {
        const p = parseCellPredicate({ kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 3 } }], transition: "improve" });
        expect(p).toMatchObject({ kind: "theme", zoneRankOn: true, zoneRankMax: 3, countOn: false, baseRankOn: false, transition: "improve" });
    });

    it("zoneRank 에 값 상한이 없으면 컷을 켜지 않는다 — '조건 없음'이 '≤기본값 활성'으로 뒤집히지 않는다", () => {
        for (const ranges of [[], [{ from: { kind: "value", value: 2 } }]]) {
            const p = parseCellPredicate({ kind: "cellValue", field: "zoneRank", ranges });
            expect(p).toMatchObject({ kind: "theme", zoneRankOn: false });
            expect(isCellPredicateEmpty(p!)).toBe(true);
        }
    });

    it("모르는 종류·깨진 payload 는 null(그 술어만 건너뛴다)", () => {
        expect(parseCellPredicate({ kind: "axisValue", axisId: "x", ranges: [] })).toBeNull();
        expect(parseCellPredicate({ kind: "cellValue", field: "없는필드", ranges: [] })).toBeNull();
        expect(parseCellPredicate({ kind: "priorHighBreak" })).toBeNull();
        expect(parseCellPredicate(null)).toBeNull();
    });

    it("타점 앵커 경계는 **받아들인다** — 하루 우주에선 평가에서 결손이지 파싱 실패가 아니다", () => {
        const p = parseCellPredicate({ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "point", point: "A|2026-09-16|09:00:00" } }] });
        expect(p).toMatchObject({ kind: "cellValue", ranges: [{ from: { kind: "point" } }] });
    });

    it("빈 구간(from·to 둘 다 없음)은 버리고, days 는 1 이상 정수로 다듬는다", () => {
        expect(parseCellPredicate({ kind: "cellValue", field: "ratePct", ranges: [{}, { from: { kind: "value", value: 1 } }] }))
            .toMatchObject({ ranges: [{ from: { kind: "value", value: 1 } }] });
        expect(parseCellPredicate({ kind: "priorHighBreak", days: 0.4 })).toMatchObject({ days: 1 });
    });

    it("전이 값이 모르는 문자열이면 전이 없음으로 떨군다(조용히 다른 뜻이 되지 않게)", () => {
        expect(parseCellPredicate({ kind: "gridPoint", transition: "언젠가" })).toEqual({ kind: "gridPoint" });
    });
});

describe("parseCellConditions", () => {
    it("배열이 아니면 null — 호출자가 시드로 폴백한다(종단 parseStages 의 '통째 폐기'와 반대)", () => {
        expect(parseCellConditions(undefined)).toBeNull();
        expect(parseCellConditions({ id: "x" })).toBeNull();
        expect(parseCellConditions("[]")).toBeNull();
    });

    it("빈 배열은 **유효한 상태**다(조건 없음 = 안 보여줌) — 시드로 되돌리지 않는다", () => {
        expect(parseCellConditions([])).toEqual([]);
    });

    it("깨진 항목만 건너뛰고 성한 편집은 보존한다", () => {
        const got = parseCellConditions([
            { id: "", predicates: [] }, // id 없음
            { id: "a", predicates: "nope" }, // 술어가 배열이 아님
            { id: "b", enabled: false, predicates: [{ kind: "gridPoint" }, { kind: "모름" }] },
        ]);
        expect(got).toEqual([{ id: "b", enabled: false, predicates: [{ kind: "gridPoint" }] }]);
    });

    it("enabled 부재는 켬으로 승계한다", () => {
        expect(parseCellConditions([{ id: "a", predicates: [] }])).toEqual([{ id: "a", enabled: true, predicates: [] }]);
    });
});

describe("비용 등급·빈 판정·재료 사용 여부", () => {
    it("theme 만 tier 2, 격자·전고는 tier 1, 나머지는 tier 0", () => {
        expect(costTierOf({ kind: "theme", ...DEFAULT_THEME_ZONE })).toBe(2);
        expect(costTierOf({ kind: "cellValue", field: "ratePct", ranges: [] })).toBe(0);
        expect(costTierOf({ kind: "time", ranges: [] })).toBe(0);
        expect(costTierOf({ kind: "gridPoint" })).toBe(1);
        expect(costTierOf({ kind: "priorHighBreak", days: 20 })).toBe(1);
    });

    it("빈 구간 술어는 '무제한'이 아니라 빈 것이다", () => {
        expect(isCellPredicateEmpty({ kind: "cellValue", field: "ratePct", ranges: [] })).toBe(true);
        expect(isCellPredicateEmpty({ kind: "time", ranges: [] })).toBe(true);
        expect(isCellPredicateEmpty({ kind: "gridPoint" })).toBe(false);
    });

    it("재료 사용 여부는 **켜진 칸만** 본다 — 끈 칸의 격자 실패가 화면을 죽이면 안 된다", () => {
        const conds: CellConditions = [
            { id: "off", enabled: false, predicates: [{ kind: "gridPoint" }] },
            { id: "on", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [] }] },
        ];
        expect(usesGridPoint(conds)).toBe(false);
        expect(usesTheme(conds)).toBe(false);
        expect(usesGridPoint([{ id: "g", enabled: true, predicates: [{ kind: "gridPoint" }] }])).toBe(true);
        expect(usesTheme([{ id: "z", enabled: true, predicates: [{ kind: "theme", ...DEFAULT_THEME_ZONE }] }])).toBe(true);
    });

    it("자물쇠는 모르는 종류에서 던진다(새 종류를 더하는 손이 컴파일 에러로 세 자리를 만난다)", () => {
        expect(() => unknownCellPredicate({ kind: "새것" } as never)).toThrow(/알 수 없는 셀 술어/);
    });
});

describe("돌파 생성기 · 캔들 모양", () => {
    it("왕복한다(전이 포함)", () => {
        const preds = [
            { kind: "breakout", zigzagPct: 2, bandPct: 0.5, chain: { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 }, transition: "firstTrue" },
            {
                kind: "breakout", zigzagPct: 3, bandPct: 1,
                chain: {
                    expr: {
                        id: "chain",
                        of: [
                            { kind: "check", id: "a", cond: { kind: "amount", minEok: 50 }, firstK: 1 },
                            { kind: "check", id: "b", cond: { kind: "sessionHigh" } },
                            { kind: "check", id: "c", cond: { kind: "openHigh", min: 1 } },
                            { kind: "check", id: "d", cond: { kind: "label", label: "baseline" }, neg: true },
                        ],
                        ops: ["and", "or", "and"],
                        groups: [{ from: 1, to: 2, firstK: 2 }],
                    },
                    firstK: null,
                },
            },
            { kind: "candleShape", shape: "bull" },
            { kind: "cellValue", field: "minuteAmountEok", ranges: [{ from: { kind: "value", value: 30 } }] },
        ];
        for (const p of preds) expect(parseCellPredicate(JSON.parse(JSON.stringify(p)))).toEqual(p);
    });

    it("노브 범위 밖은 **클램프**, 빠진 필드는 기본값 — 술어를 버리지 않는다", () => {
        const empty = { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 };
        expect(parseCellPredicate({ kind: "breakout", zigzagPct: 99, bandPct: -1 }))
            .toEqual({ kind: "breakout", zigzagPct: 10, bandPct: 0, chain: empty });
        expect(parseCellPredicate({ kind: "breakout" })).toEqual({ kind: "breakout", zigzagPct: 2, bandPct: 0.5, chain: empty });
    });

    it("식 이전 저장물(봉 조건 필드 + 술어 이름표)은 AND 로 이은 식으로 옮긴다", () => {
        const p = parseCellPredicate({
            kind: "breakout", zigzagPct: 2, bandPct: 0.5, label: "baseline",
            chain: { amountEok: 50, sessionHigh: "no", firstK: 2 },
        }) as Extract<CellPredicate, { kind: "breakout" }>;
        expect(p.chain.firstK).toBe(2);
        expect(p.chain.expr.of.map((t) => [t.cond, t.neg === true])).toEqual([
            [{ kind: "amount", minEok: 50 }, false],
            [{ kind: "sessionHigh" }, true],
            [{ kind: "label", label: "baseline" }, false],
        ]);
        expect(p.chain.expr.ops).toEqual(["and", "and"]);
    });

    it("후보 키는 사슬 필터 식마다(항 id 는 무관), 구조 키는 zigzag·밴드마다", () => {
        const a = parseCellPredicate({ kind: "breakout" }) as Extract<CellPredicate, { kind: "breakout" }>;
        const term = (id: string) => ({ kind: "check" as const, id, cond: { kind: "amount" as const, minEok: 50 } });
        const b = { ...a, chain: { expr: { id: "chain", of: [term("x")], ops: [], groups: [] }, firstK: 1 } };
        const b2 = { ...a, chain: { expr: { id: "chain", of: [term("y")], ops: [], groups: [] }, firstK: 1 } };
        expect(breakoutKeyOf(a)).not.toBe(breakoutKeyOf(b));
        expect(breakoutKeyOf(b)).toBe(breakoutKeyOf(b2));
        expect(breakoutStructKeyOf(a)).toBe(breakoutStructKeyOf(b));
    });

    it("모르는 캔들 모양은 null(그 술어만 건너뛴다)", () => {
        expect(parseCellPredicate({ kind: "candleShape", shape: "doji" })).toBeNull();
    });

    it("비용 등급 — 돌파 1 · 캔들 0, 둘 다 비어 있지 않다", () => {
        const b = parseCellPredicate({ kind: "breakout" })!;
        const c = parseCellPredicate({ kind: "candleShape", shape: "bear" })!;
        expect([costTierOf(b), costTierOf(c)]).toEqual([1, 0]);
        expect(isCellPredicateEmpty(b) || isCellPredicateEmpty(c)).toBe(false);
    });
});
