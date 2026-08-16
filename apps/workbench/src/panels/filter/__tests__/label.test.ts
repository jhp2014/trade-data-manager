import { describe, it, expect } from "vitest";
import { groupExprLabel, kindLabel, predicateLabel, stageLabel, type LabelLookup } from "../label.js";
import { NO_TAGS, type GroupExpr } from "../../rank/groupFilter.js";
import type { FilterPredicate, FilterStage } from "../stage.js";

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

    it("'그룹 없음'은 제 이름으로", () => {
        expect(groupExprLabel({ groups: [{ literals: [{ groupId: NO_TAGS, neg: false }] }] }, look)).toBe("그룹 없음");
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
