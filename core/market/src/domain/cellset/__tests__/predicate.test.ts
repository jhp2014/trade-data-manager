import { describe, it, expect } from "vitest";
import {
    breakoutKeyOf,
    breakoutStructKeyOf,
    costTierOf,
    isCellPredicateEmpty,
    parseCellConditions,
    parseCellPredicate,
    unknownCellPredicate,
    type CellPredicate,
} from "../predicate.js";
import { DEFAULT_THEME_ZONE } from "../themeZone.js";

// 파서는 panelUi(무검증 JSON 가방)의 유일한 문지기다 — 여기가 뚫리면 깨진 blob 이 평가기까지 간다.

describe("parseCellPredicate", () => {
    it("세 종류를 왕복한다", () => {
        const preds = [
            { kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: 100 } }] },
            { kind: "label", scope: "point", groups: ["돌파: 성공", "재돌파: 성공"] },
            { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] },
        ];
        for (const p of preds) expect(parseCellPredicate(JSON.parse(JSON.stringify(p)))).toEqual(p);
    });

    it("옛 % 셀 값 → 캔들 축 이주: ratePct → rate, minuteHighPct → highRate(첫 구간의 값 경계만)", () => {
        expect(parseCellPredicate({ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 }, to: { kind: "value", value: 12 } }, { from: { kind: "value", value: 20 } }] }))
            .toEqual({ kind: "candle", axes: { rate: { on: true, from: 5, to: 12 } } });
        expect(parseCellPredicate({ kind: "cellValue", field: "minuteHighPct", ranges: [{ from: { kind: "value", value: 5 } }] }))
            .toEqual({ kind: "candle", axes: { highRate: { on: true, from: 5 } } });
        // 옛 inRanges 는 뒤집힌 구간을 스왑해 통과시켰다 — 이주도 스왑해야 뜻이 보존된다(리뷰 M2).
        expect(parseCellPredicate({ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 9 }, to: { kind: "value", value: 5 } }] }))
            .toEqual({ kind: "candle", axes: { rate: { on: true, from: 5, to: 9 } } });
        // 값 경계가 없으면(빈 구간·타점 앵커 경계) 축이 켜지되 조건 없음 = 빈 술어(정직한 결과).
        expect(isCellPredicateEmpty(parseCellPredicate({ kind: "cellValue", field: "ratePct", ranges: [] })!)).toBe(true);
    });

    it("옛 전이 저장물 — 술어에서 벗기고, theme 의 처음으로·직전 대비 상승만 enter 로 잇는다", () => {
        const stripped = parseCellPredicate({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: 5 } }], transition: "firstOfDay" })!;
        expect("transition" in stripped).toBe(false);
        const migrated = parseCellPredicate({ kind: "theme", ...DEFAULT_THEME_ZONE, transition: "improve" });
        expect(migrated).toMatchObject({ kind: "theme", enter: true });
        const always = parseCellPredicate({ kind: "theme", ...DEFAULT_THEME_ZONE, transition: "firstOfDay" })!;
        expect("enter" in always, "하루 처음은 등가물이 없다 — 상시로").toBe(false);
    });

    it("옛 존순위 셀 값(zoneRank) → theme 이주 — 값 상한 보존·전이는 enter 로", () => {
        const p = parseCellPredicate({ kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 3 } }], transition: "improve" });
        expect(p).toMatchObject({ kind: "theme", zoneRankOn: true, zoneRankMax: 3, countOn: false, baseRankOn: false, enter: true });
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
        expect(parseCellPredicate({ kind: "label", groups: ["a"] }), "scope 없는 라벨은 무엇을 묻는지 모른다").toBeNull();
        expect(parseCellPredicate(null)).toBeNull();
    });

    it("타점 앵커 경계는 **받아들인다** — 하루 우주에선 평가에서 결손이지 파싱 실패가 아니다", () => {
        const p = parseCellPredicate({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "point", point: "A|2026-09-16|09:00:00" } }] });
        expect(p).toMatchObject({ kind: "cellValue", ranges: [{ from: { kind: "point" } }] });
    });

    it("빈 구간(from·to 둘 다 없음)은 버리고, 라벨 그룹 목록은 다듬는다", () => {
        expect(parseCellPredicate({ kind: "cellValue", field: "cumAmountEok", ranges: [{}, { from: { kind: "value", value: 1 } }] }))
            .toMatchObject({ ranges: [{ from: { kind: "value", value: 1 } }] });
        // 라벨 그룹 — 문자열만·빈 문자열 제외·중복 제거(순서 보존).
        expect(parseCellPredicate({ kind: "label", scope: "day", groups: ["b", 3, "", "b", "a"] }))
            .toEqual({ kind: "label", scope: "day", groups: ["b", "a"] });
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
            { id: "b", enabled: false, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }, { kind: "모름" }] },
        ]);
        expect(got).toEqual([{ id: "b", enabled: false, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }] }]);
    });

    it("enabled 부재는 켬으로 승계한다", () => {
        expect(parseCellConditions([{ id: "a", predicates: [] }])).toEqual([{ id: "a", enabled: true, predicates: [] }]);
    });
});

describe("비용 등급·빈 판정·재료 사용 여부", () => {
    it("theme 만 tier 2, 돌파·기준선 캔들은 tier 1, 나머지(라벨 포함)는 tier 0", () => {
        expect(costTierOf({ kind: "theme", ...DEFAULT_THEME_ZONE })).toBe(2);
        expect(costTierOf({ kind: "cellValue", field: "cumAmountEok", ranges: [] })).toBe(0);
        expect(costTierOf({ kind: "candle", axes: { rate: { on: true, from: 5 } } }), "캔들은 tier 0").toBe(0);
        expect(costTierOf({ kind: "candle", axes: { baseline: { on: true, from: 0 } } }), "기준선 축이 켜지면 tier 1").toBe(1);
        expect(costTierOf({ kind: "time", ranges: [] })).toBe(0);
        expect(costTierOf({ kind: "label", scope: "day", groups: ["a"] }), "라벨은 집합 조회 — tier 0").toBe(0);
        expect(isCellPredicateEmpty({ kind: "label", scope: "point", groups: [] }), "그룹 안 고른 라벨은 빈 술어").toBe(true);
    });

    it("빈 구간 술어는 '무제한'이 아니라 빈 것이다", () => {
        expect(isCellPredicateEmpty({ kind: "cellValue", field: "cumAmountEok", ranges: [] })).toBe(true);
        expect(isCellPredicateEmpty({ kind: "candle", axes: {} }), "켜진 축 없음 = 빈 술어").toBe(true);
        expect(isCellPredicateEmpty({ kind: "candle", axes: { rate: { on: true } } }), "경계 없는 축은 조건이 아니다").toBe(true);
        expect(isCellPredicateEmpty({ kind: "candle", axes: { rate: { on: false, from: 5 } } }), "끈 축은 조건이 아니다").toBe(true);
        expect(isCellPredicateEmpty({ kind: "candle", axes: { rate: { on: true, from: 5 } } })).toBe(false);
        expect(isCellPredicateEmpty({ kind: "time", ranges: [] })).toBe(true);
    });


    it("자물쇠는 모르는 종류에서 던진다(새 종류를 더하는 손이 컴파일 에러로 세 자리를 만난다)", () => {
        expect(() => unknownCellPredicate({ kind: "새것" } as never)).toThrow(/알 수 없는 셀 술어/);
    });
});

describe("돌파 생성기 · 캔들 모양", () => {
    it("왕복한다", () => {
        const preds = [
            { kind: "breakout", zigzagPct: 2, bandPct: 0.5, chain: { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 } },
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
            { kind: "candle", axes: { rate: { on: true, from: 5 }, openClose: { on: false, from: 0.01 }, baseline: { on: true, from: -2, to: 3 } } },
            { kind: "cellValue", field: "minuteAmountEok", ranges: [{ from: { kind: "value", value: 30 } }] },
        ];
        for (const p of preds) expect(parseCellPredicate(JSON.parse(JSON.stringify(p)))).toEqual(p);
    });

    it("옛 candleShape → 캔들 시가→종가 축(0.01% = 옛 엄격 부등호의 등가)", () => {
        expect(parseCellPredicate({ kind: "candleShape", shape: "bull" }))
            .toEqual({ kind: "candle", axes: { openClose: { on: true, from: 0.01 } } });
        expect(parseCellPredicate({ kind: "candleShape", shape: "bear" }))
            .toEqual({ kind: "candle", axes: { openClose: { on: true, to: -0.01 } } });
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

    it("비용 등급 — 돌파 1 · 캔들(기준선 축 없음) 0, 둘 다 비어 있지 않다", () => {
        const b = parseCellPredicate({ kind: "breakout" })!;
        const c = parseCellPredicate({ kind: "candleShape", shape: "bear" })!;
        expect([costTierOf(b), costTierOf(c)]).toEqual([1, 0]);
        expect(isCellPredicateEmpty(b) || isCellPredicateEmpty(c)).toBe(false);
    });
});
