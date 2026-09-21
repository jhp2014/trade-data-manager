import { describe, it, expect } from "vitest";
import { groupExprLabel, kindLabel, predicateLabel, setDisplayName, stageLabel, type LabelLookup } from "../label.js";
import { NONE_GROUP, type GroupExpr } from "../../rank/groupFilter.js";
import type { FilterPredicate, FilterStage } from "../stage.js";
import { exprOfStages, type SetExpr, type SetTerm } from "../expr.js";

/** 연산자가 균일한 식 — 괄호가 없는 줄(대부분의 검사가 이 모양이다). */
const mk = (op: "and" | "or", id: string, of: SetTerm[]): SetExpr => ({ id, of, ops: of.slice(1).map(() => op), groups: [] });

const look: LabelLookup = {
    groupName: (id) => (({ g1: "돌파", g2: "눌림" }) as Record<string, string>)[id],
    axisName: (id: string) => (id === "a1" ? "눌림깊이" : undefined),
};

const stage = (predicates: FilterPredicate[], name?: string): FilterStage => ({ id: "s", enabled: true, name, predicates });

describe("groupExprLabel — DNF 한 줄", () => {
    it("절 안은 &, 절끼리는 |, 부정은 !", () => {
        const expr: GroupExpr = {
            groups: [
                { literals: [{ groupId: "g1", neg: false }, { groupId: "g2", neg: true }] },
                { literals: [{ groupId: "g2", neg: false }] },
            ],
        };
        expect(groupExprLabel(expr, look)).toBe("돌파 & !눌림 | 눌림");
    });

    it("'…그룹 없음'은 층위까지 제 이름으로", () => {
        expect(groupExprLabel({ groups: [{ literals: [{ groupId: NONE_GROUP, neg: false }] }] }, look)).toBe("그룹 없음");
    });

    it("⚠ 지워진 그룹은 눈에 띄게 남긴다 — 조용히 건너뛰면 멀쩡한 조건처럼 보인다", () => {
        expect(groupExprLabel({ groups: [{ literals: [{ groupId: "없는것", neg: false }] }] }, look)).toBe("(지워짐)");
    });
});

describe("predicateLabel", () => {
    it("축은 이름, 지워졌으면 그렇다고", () => {
        expect(predicateLabel({ kind: "axisBand", axisId: "a1", band: {} }, look)).toBe("눌림깊이");
        expect(predicateLabel({ kind: "axisValue", axisId: "a1", ranges: [] }, look)).toBe("눌림깊이 값");
        expect(predicateLabel({ kind: "axisBand", axisId: "없는축", band: {} }, look)).toBe("(지워짐)");
    });

    it("날짜·시간은 하나면 구간 그대로, 여럿이면 개수", () => {
        expect(predicateLabel({ kind: "date", ranges: [{ from: "2025-07-01", to: "2025-07-31" }] }, look)).toBe("25.07.01~25.07.31");
        expect(predicateLabel({ kind: "date", ranges: [{ from: "a", to: "b" }, { from: "c", to: "d" }] }, look)).toBe("날짜 2구간");
        expect(predicateLabel({ kind: "time", ranges: [{ from: "09:00", to: "10:00" }] }, look)).toBe("09:00~10:00");
    });
});

describe("kindLabel — 축은 밴드든 값이든 축", () => {
    it("종류를 사람 말로", () => {
        expect(kindLabel("group")).toBe("그룹");
        expect(kindLabel("axisBand")).toBe("축");
        expect(kindLabel("axisValue")).toBe("축");
        expect(kindLabel("themeStrength")).toBe("테마"); // 컴파일러가 안 잡는 자리(default "") — 빠지면 빈 라벨로 조용히 뜬다
        expect(kindLabel(undefined)).toBe("");
    });
});

describe("stageLabel", () => {
    it("손으로 준 이름이 우선", () => {
        expect(stageLabel(stage([{ kind: "date", ranges: [] }], "1차 거르기"), look)).toBe("1차 거르기");
    });

    it("없으면 조건에서 만든다", () => {
        const s = stage([{ kind: "date", ranges: [{ from: "2025-07-01", to: "2025-07-31" }] }]);
        expect(stageLabel(s, look)).toBe("25.07.01~25.07.31");
    });

    it("빈 술어는 이름에 안 낀다", () => {
        const s = stage([
            { kind: "date", ranges: [{ from: "2025-07-01", to: "2025-07-31" }] },
            { kind: "time", ranges: [] },
        ]);
        expect(stageLabel(s, look)).toBe("25.07.01~25.07.31");
    });

    it("조건이 하나도 없으면 그렇다고 말한다", () => {
        expect(stageLabel(stage([]), look)).toBe("조건 없음");
    });
});

// ── 집합 표시 이름 (2026-09-20) ────────────────────────────────────────────
//
// `SavedSet.name` 은 옵셔널이고 **부재 = 자동 이름**이다(점선 칩). 저장 시점에 굽지 않는 이유는
// 재료(LabelLookup)가 스토어 동기 초기화 시점엔 없기 때문 — 거기서 구우면 축 **키**가 이름으로 굳는다.
describe("setDisplayName — 손 이름이 없으면 내용에서 만든다", () => {
    const nameLook: LabelLookup = { groupName: (id) => id, axisName: (id) => `축 ${id}` };
    const st = (id: string, from: number): FilterStage =>
        ({ id, enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: from } }] }] });

    it("손 이름이 있으면 그대로", () => {
        expect(setDisplayName({ name: "아침 돌파", expr: exprOfStages([st("a", 5)]) }, nameLook)).toBe("아침 돌파");
    });

    it("없으면 첫 조건 + 외 N", () => {
        expect(setDisplayName({ expr: exprOfStages([st("a", 5)]) }, nameLook)).toBe(stageLabel(st("a", 5), nameLook));
        expect(setDisplayName({ expr: exprOfStages([st("a", 5), st("b", 8)]) }, nameLook))
            .toBe(`${stageLabel(st("a", 5), nameLook)} 외 1`);
    });

    it("조건이 하나도 없으면 '빈 집합'", () => {
        expect(setDisplayName({ expr: exprOfStages([]) }, nameLook)).toBe("빈 집합");
    });
});

// ⚠ 새 모델에서 제일 흔한 모양은 `AND(참조, 참조)`(조건 0개)다 — 조건만 세면 그게 "빈 집합"으로
//   불리고 칩·빵부스러기·목록이 한꺼번에 거짓말한다(2026-09-20 리뷰가 잡은 자리).
describe("setDisplayName — 참조도 항이다", () => {
    const look: LabelLookup = { groupName: (id) => id, axisName: (id) => `축 ${id}` };
    const ref = (setId: string): SetTerm => ({ kind: "ref", id: `r-${setId}`, setId });

    it("참조만 든 집합은 '빈 집합'이 아니다 — 첫 항의 이름 + 외 N", () => {
        const expr: SetExpr = mk("and", "root", [ref("a"), ref("b")]);
        expect(setDisplayName({ expr }, look, (id) => (id === "a" ? "아침 돌파" : "거래대금"))).toBe("아침 돌파 외 1");
    });

    it("참조 이름을 안 주면 (묶음) — 이름 짓다가 그래프를 걷지 않는다", () => {
        const expr: SetExpr = mk("and", "root", [ref("a")]);
        expect(setDisplayName({ expr }, look)).toBe("(묶음)");
    });

    it("진짜 빈 식만 '빈 집합'이다", () => {
        expect(setDisplayName({ expr: mk("and", "root", []) }, look)).toBe("빈 집합");
    });
});
