import { describe, it, expect } from "vitest";
import { committingUniverse, effectiveUniverse, kindDeficiency, parseUniverse, predicateDeficiency, stageDeficiency, universeOfExpr, universeOfStages, UNIVERSES, type Universe } from "../universe.js";
import { exprOfStages, refNode, type SetExpr, type SetTerm } from "../expr.js";
import type { FilterPredicate, PredicateKind } from "../stage.js";

/** 연산자가 균일한 식 — 괄호가 없는 줄(대부분의 검사가 이 모양이다). */
const mk = (op: "and" | "or", id: string, of: SetTerm[]): SetExpr => ({ id, of, ops: of.slice(1).map(() => op), groups: [] });

// 이 표가 **스펙**이고 테스트는 그 사본이다 — 결손 지도의 단일 출처(universe.ts)가 여기와 어긋나면
// 팔레트의 회색과 평가의 결손이 다른 이야기를 한다.
const AVAILABLE: Record<Universe, PredicateKind[]> = {
    longitudinal: ["group", "axisBand", "axisValue", "date", "time", "themeStrength", "outcome", "outcomeRecovery", "hotPoints"],
    daily: ["time", "cellValue", "priorHighBreak", "gridPoint"],
};
const ALL_KINDS: PredicateKind[] = [
    "group", "axisBand", "axisValue", "date", "time", "themeStrength",
    "outcome", "outcomeRecovery", "hotPoints", "cellValue", "priorHighBreak", "gridPoint",
];

describe("kindDeficiency — 종류 × 우주 전수", () => {
    for (const u of UNIVERSES) {
        for (const k of ALL_KINDS) {
            const ok = AVAILABLE[u].includes(k);
            it(`${u} × ${k} = ${ok ? "가용" : "결손"}`, () => {
                const d = kindDeficiency(k, u);
                if (ok) expect(d).toBeNull();
                else expect(d, "결손이면 **이유**가 있어야 한다 — 회색만 두면 사용자가 왜인지 모른다").toBeTruthy();
            });
        }
    }
});

describe("predicateDeficiency — payload 까지 본다", () => {
    it("전이 수식어는 종단에서 결손이다(종단 행에는 '직전 분'이 없다)", () => {
        const p: FilterPredicate = { kind: "time", ranges: [{ from: "09:00", to: "10:00" }], transition: "firstOfDay" };
        expect(predicateDeficiency(p, "daily")).toEqual([]);
        expect(predicateDeficiency(p, "longitudinal")).toHaveLength(1);
    });

    it("전이 없는 시각 술어는 두 우주 다 가용 — 합쳐진 한 종류다", () => {
        const p: FilterPredicate = { kind: "time", ranges: [{ from: "09:00", to: "10:00" }] };
        expect(predicateDeficiency(p, "daily")).toEqual([]);
        expect(predicateDeficiency(p, "longitudinal")).toEqual([]);
    });

    it("타점 앵커 경계는 하루에서 결손 — 값 경계는 가용", () => {
        const anchored: FilterPredicate = { kind: "axisValue", axisId: "a1", ranges: [{ from: { kind: "point", point: "A|2026-07-24|09:31:00" } }] };
        const valued: FilterPredicate = { kind: "axisValue", axisId: "a1", ranges: [{ from: { kind: "value", value: 5 } }] };
        // 축 자체가 하루에서 결손이라 이유가 둘(종류 + 경계) — 값 경계면 하나다.
        expect(predicateDeficiency(anchored, "daily")).toHaveLength(2);
        expect(predicateDeficiency(valued, "daily")).toHaveLength(1);
    });

    it("셀 값 술어는 종단에서 결손, 하루에서 가용", () => {
        const p: FilterPredicate = { kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] };
        expect(predicateDeficiency(p, "longitudinal")).toHaveLength(1);
        expect(predicateDeficiency(p, "daily")).toEqual([]);
    });
});

describe("칸·우주 파생", () => {
    const cellStage = { id: "s1", enabled: true, predicates: [{ kind: "cellValue" as const, field: "ratePct" as const, ranges: [{ from: { kind: "value" as const, value: 5 } }] }] };
    const timeStage = { id: "s2", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: "09:00", to: "10:00" }] }] };

    it("칸의 결손은 술어 이유의 합집합(중복 제거)", () => {
        expect(stageDeficiency(cellStage, "daily")).toEqual([]);
        expect(stageDeficiency(cellStage, "longitudinal")).toHaveLength(1);
        expect(stageDeficiency(timeStage, "longitudinal")).toEqual([]);
    });

    // ── 우주 **파생**(2026-09-19 9단계) — 선언 필드도 토글도 없다. 조건이 우주를 정한다.
    it("한쪽에만 사는 종류가 우주를 정한다 — 양쪽에 사는 종류(중립)는 안 정한다", () => {
        expect(committingUniverse("cellValue")).toBe("daily");   // 종단에서 결손
        expect(committingUniverse("axisValue")).toBe("longitudinal"); // 하루에서 결손
        expect(committingUniverse("date")).toBe("longitudinal");  // 날짜는 하루에선 변수다
        expect(committingUniverse("time"), "시각은 양쪽에 산다 = 중립").toBeNull();
    });

    it("조건이 없거나 중립뿐이면 **미정**이고, 확정값은 종단으로 떨어진다", () => {
        expect(universeOfStages([])).toBeNull();
        expect(universeOfStages([timeStage])).toBeNull();
        expect(effectiveUniverse(null)).toBe("longitudinal");
        expect(universeOfStages([timeStage, cellStage]), "첫 한쪽-전용이 정한다").toBe("daily");
    });

    // ⚠ 이게 참조를 보는 이유다 — `A ∨ B`(둘 다 하루 집합)는 **조건 잎이 하나도 없다**.
    //   참조를 안 보면 종단으로 파생돼 하루 패널이 제 집합을 못 찾는다.
    it("조립(참조만 든 식)의 우주는 참조가 정한다", () => {
        const assembled = mk("or", "g1", [refNode("s-a"), refNode("s-b")]);
        const noRefs = (): null => null;
        expect(universeOfExpr(assembled, noRefs), "가리키는 집합을 모르면 미정").toBeNull();
        expect(universeOfExpr(assembled, (id) => (id === "s-a" ? "daily" : null))).toBe("daily");
        // 지워진 참조는 우주를 안 정한다 — 그 뒤의 조건 잎이 정한다.
        const mixed = mk("and", "g2", [refNode("사라진것"), { kind: "cond" as const, stage: cellStage }]);
        expect(universeOfExpr(mixed, noRefs)).toBe("daily");
    });

    it("잎만 든 식은 stages 판과 같은 답을 낸다(두 입구가 안 갈린다)", () => {
        const e = exprOfStages([timeStage, cellStage]);
        expect(universeOfExpr(e, () => null)).toBe(universeOfStages([timeStage, cellStage]));
    });
});

describe("parseUniverse — 부재·오염은 종단(우주가 없던 시절의 행동)", () => {
    it.each([[undefined], [null], ["nope"], [42], [{}]])("%s → longitudinal", (v) => {
        expect(parseUniverse(v)).toBe("longitudinal");
    });
    it("daily 만 daily", () => expect(parseUniverse("daily")).toBe("daily"));
});
