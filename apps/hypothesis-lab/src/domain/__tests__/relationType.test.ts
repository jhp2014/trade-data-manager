import { describe, expect, it } from "vitest";
import {
    DEFAULT_RELATION_TYPES,
    directionalValues,
    findRelationType,
    makeRelationValue,
    toEdgeVisual,
} from "@/domain/relationType";

describe("makeRelationValue", () => {
    it("ascii label 은 slug 화", () => {
        expect(makeRelationValue("Better Than", [])).toBe("better_than");
    });

    it("충돌 시 접미사", () => {
        expect(makeRelationValue("dup", ["dup"])).toBe("dup_2");
        expect(makeRelationValue("dup", ["dup", "dup_2"])).toBe("dup_3");
    });

    it("한글 등 비ascii 는 시간기반 키", () => {
        expect(makeRelationValue("상위", [])).toMatch(/^r[a-z0-9]+$/);
    });
});

describe("directionalValues", () => {
    it("direction !== none 만 포함", () => {
        const set = directionalValues(DEFAULT_RELATION_TYPES);
        expect(set.has("better_than")).toBe(true);
        expect(set.has("parent_of")).toBe(true);
        expect(set.has("similar_to")).toBe(false);
        expect(set.has("conflicts_with")).toBe(false);
    });
});

describe("toEdgeVisual", () => {
    it("forward → 화살촉 end", () => {
        const def = findRelationType(DEFAULT_RELATION_TYPES, "better_than")!;
        const v = toEdgeVisual(def);
        expect(v.arrowSide).toBe("end");
        expect(v.stroke).toBe("#5b6cff");
    });

    it("none → 화살촉 없음", () => {
        const def = findRelationType(DEFAULT_RELATION_TYPES, "similar_to")!;
        expect(toEdgeVisual(def).arrowSide).toBeNull();
    });

    it("backward → 화살촉 start", () => {
        const v = toEdgeVisual({
            value: "x",
            label: "x",
            color: "teal",
            lineStyle: "solid",
            edgeType: "step",
            direction: "backward",
            arrowHead: "open",
        });
        expect(v.arrowSide).toBe("start");
        expect(v.edgeType).toBe("step");
    });

    it("모르는 정의(undefined)는 중립 회색 무방향", () => {
        const v = toEdgeVisual(undefined);
        expect(v.arrowSide).toBeNull();
        expect(v.stroke).toBe("#9aa0ad");
    });

    it("dotted 는 round + dash", () => {
        const def = findRelationType(DEFAULT_RELATION_TYPES, "similar_to")!;
        const v = toEdgeVisual(def);
        expect(v.round).toBe(true);
        expect(v.dash).toBeDefined();
    });
});
