import { describe, it, expect } from "vitest";
import {
    activeStages, addStage, autoGrain, canExpand, displayGrain, isPredicateEmpty, moveStage,
    parseStages, predicateGrain, removeStage, renameStage, setStagePredicates, stageGrain, toggleStage,
    type FilterPredicate, type FilterStage, type Grain, type GrainLookup,
} from "../stage.js";
import { NO_TAGS, type GroupExpr } from "../../rank/groupFilter.js";

const expr = (...ids: string[]): GroupExpr => ({ groups: ids.map((id) => ({ literals: [{ groupId: id, neg: false }] })) });
const stage = (id: string, predicates: FilterPredicate[], enabled = true): FilterStage => ({ id, enabled, predicates });

/** g1=하루 그룹 · g2=타점 그룹 / a1=하루 축 · a2=타점 축. 그 밖은 지워진 것(undefined). */
const look: GrainLookup = {
    groupScope: (id) => (({ g1: "day", g2: "point" }) as Record<string, Grain>)[id],
    axisScope: (id) => (({ a1: "day", a2: "point" }) as Record<string, Grain>)[id],
};

describe("isPredicateEmpty — 빈 조건은 평가에서 빠져야 한다", () => {
    it("빈 식·빈 배열·빈 밴드는 비었다", () => {
        expect(isPredicateEmpty({ kind: "group", expr: { groups: [] } })).toBe(true);
        expect(isPredicateEmpty({ kind: "axisBand", axisId: "a1", band: {} })).toBe(true);
        expect(isPredicateEmpty({ kind: "date", ranges: [] })).toBe(true);
    });

    it("한쪽 경계만 있어도 조건이다(반열림)", () => {
        expect(isPredicateEmpty({ kind: "axisBand", axisId: "a1", band: { lo: "slot1" } })).toBe(false);
    });
});

describe("activeStages — 켜져 있고 빈 술어가 아닌 게 있어야 센다", () => {
    it("꺼진 단계는 빠진다", () => {
        const s = [stage("a", [{ kind: "date", ranges: [{ from: "2025-07-01", to: "2025-07-31" }] }], false)];
        expect(activeStages(s)).toEqual([]);
    });

    it("술어가 전부 비면 켜져 있어도 빠진다 — 무제한이 '전부 미배치'로 뒤집히면 안 된다", () => {
        expect(activeStages([stage("a", [{ kind: "date", ranges: [] }])])).toEqual([]);
    });
});

describe("predicateGrain — 알갱이는 저장하지 않고 파생한다", () => {
    it("날짜는 하루, 시간은 타점(시각 없이는 판정 불가)", () => {
        expect(predicateGrain({ kind: "date", ranges: [] }, look)).toBe("day");
        expect(predicateGrain({ kind: "time", ranges: [] }, look)).toBe("point");
    });

    it("축은 그 축의 scope 를 따른다", () => {
        expect(predicateGrain({ kind: "axisBand", axisId: "a1", band: {} }, look)).toBe("day");
        expect(predicateGrain({ kind: "axisValue", axisId: "a2", ranges: [] }, look)).toBe("point");
    });

    it("모르는 축(지워짐)은 하루 — 죽은 참조 하나가 화면을 타점으로 끌어내리면 가짜 정밀도가 된다", () => {
        expect(predicateGrain({ kind: "axisBand", axisId: "없는축", band: {} }, look)).toBe("day");
    });

    it("그룹은 타점 scope 가 하나라도 섞이면 타점", () => {
        expect(predicateGrain({ kind: "group", expr: expr("g1") }, look)).toBe("day");
        expect(predicateGrain({ kind: "group", expr: expr("g1", "g2") }, look)).toBe("point");
    });

    it("'그룹 없음'만으로는 알갱이를 안 정한다 — 옆 리터럴이 말하게 둔다", () => {
        expect(predicateGrain({ kind: "group", expr: expr(NO_TAGS) }, look)).toBe("day");
        expect(predicateGrain({ kind: "group", expr: expr(NO_TAGS, "g2") }, look)).toBe("point");
    });
});

describe("stageGrain / autoGrain — 가장 가는 것으로", () => {
    it("단계 안 술어 중 가장 가는 것이 그 단계의 알갱이", () => {
        const s = stage("a", [{ kind: "date", ranges: [{ from: "x", to: "y" }] }, { kind: "time", ranges: [{ from: "09:00", to: "10:00" }] }]);
        expect(stageGrain(s, look)).toBe("point");
    });

    it("빈 술어는 알갱이를 안 정한다", () => {
        const s = stage("a", [{ kind: "date", ranges: [{ from: "x", to: "y" }] }, { kind: "time", ranges: [] }]);
        expect(stageGrain(s, look)).toBe("day");
    });

    it("자동 해상도 = 걸린 단계 중 가장 가는 것", () => {
        const stages = [
            stage("a", [{ kind: "date", ranges: [{ from: "x", to: "y" }] }]),
            stage("b", [{ kind: "group", expr: expr("g2") }]),
        ];
        expect(autoGrain(stages, look)).toBe("point");
    });

    it("꺼진 타점 단계는 해상도를 못 끌어내린다", () => {
        const stages = [
            stage("a", [{ kind: "date", ranges: [{ from: "x", to: "y" }] }]),
            stage("b", [{ kind: "group", expr: expr("g2") }], false),
        ];
        expect(autoGrain(stages, look)).toBe("day");
    });

    it("아무것도 안 걸렸으면 하루", () => {
        expect(autoGrain([], look)).toBe("day");
    });
});

describe("displayGrain — 사다리는 아래로만", () => {
    it("자동이 하루면 손으로 타점까지 내릴 수 있다", () => {
        expect(displayGrain("day", false)).toBe("day");
        expect(displayGrain("day", true)).toBe("point");
    });

    it("자동이 타점이면 올릴 수 없다 — 롤업 규칙이 정의되지 않는다", () => {
        expect(displayGrain("point", false)).toBe("point");
        expect(displayGrain("point", true)).toBe("point");
    });

    it("내리기 손잡이는 자동이 하루일 때만", () => {
        expect(canExpand("day")).toBe(true);
        expect(canExpand("point")).toBe(false);
    });
});

describe("편집 연산 — 전부 불변", () => {
    const base = [stage("a", []), stage("b", []), stage("c", [])];

    it("추가는 끝에 붙고 켜진 상태로 시작", () => {
        const next = addStage(base);
        expect(next).toHaveLength(4);
        expect(next[3].enabled).toBe(true);
        expect(base).toHaveLength(3);
    });

    it("순서 바꾸기 — 원본은 안 건드린다", () => {
        expect(moveStage(base, 0, 2).map((s) => s.id)).toEqual(["b", "c", "a"]);
        expect(base.map((s) => s.id)).toEqual(["a", "b", "c"]);
    });

    it("범위 밖 이동은 그대로", () => {
        expect(moveStage(base, 0, 9).map((s) => s.id)).toEqual(["a", "b", "c"]);
        expect(moveStage(base, 1, 1).map((s) => s.id)).toEqual(["a", "b", "c"]);
    });

    it("끄기는 지우지 않는다 — 잠깐 빼보는 게 한계 기여도 확인 손짓이다", () => {
        const next = toggleStage(base, "b");
        expect(next[1].enabled).toBe(false);
        expect(next).toHaveLength(3);
    });

    it("제거·조건 교체·이름", () => {
        expect(removeStage(base, "b").map((s) => s.id)).toEqual(["a", "c"]);
        const withPred = setStagePredicates(base, "a", [{ kind: "date", ranges: [] }]);
        expect(withPred[0].predicates).toHaveLength(1);
        expect(renameStage(base, "a", " 돌파 ")[0].name).toBe("돌파");
    });

    it("빈 이름은 자동 라벨로 되돌린다(undefined)", () => {
        const named = renameStage(base, "a", "돌파");
        expect(renameStage(named, "a", "   ")[0].name).toBeUndefined();
    });
});

describe("parseStages — 반쯤 살아난 조건은 없느니만 못하다", () => {
    it("정상 저장본을 읽는다", () => {
        const raw = [{ id: "a", enabled: true, predicates: [{ kind: "date", ranges: [] }] }];
        expect(parseStages(raw)).toEqual([{ id: "a", name: undefined, enabled: true, predicates: [{ kind: "date", ranges: [] }] }]);
    });

    it("enabled 가 없으면 켜진 것으로 본다(옛 저장본 관용)", () => {
        expect(parseStages([{ id: "a", predicates: [] }])![0].enabled).toBe(true);
    });

    it("배열이 아니거나 모르는 술어 종류면 통째로 버린다", () => {
        expect(parseStages({})).toBeNull();
        expect(parseStages([{ id: "a", predicates: [{ kind: "옛것" }] }])).toBeNull();
        expect(parseStages([{ enabled: true, predicates: [] }])).toBeNull();
    });
});
