import { describe, expect, it } from "vitest";
import { computeWarnings } from "@/domain/validation";
import type { HypothesisRelation } from "@/domain/types";

function rel(
    from: string,
    type: string,
    to: string,
    id = `${from}-${type}-${to}`,
): HypothesisRelation {
    return {
        id,
        fromHypothesisId: from,
        toHypothesisId: to,
        relationType: type,
        note: null,
    };
}

function codes(rels: HypothesisRelation[]): string[] {
    return computeWarnings({ hypothesisRelations: rels }).map((w) => w.code);
}

describe("computeWarnings", () => {
    it("관계가 없으면 경고도 없다", () => {
        expect(computeWarnings({ hypothesisRelations: [] })).toEqual([]);
    });

    it("정상 DAG 는 경고 없음", () => {
        const rels = [
            rel("2", "better_than", "1"),
            rel("3", "better_than", "1"),
            rel("10", "parent_of", "1"),
        ];
        expect(codes(rels)).toEqual([]);
    });

    it("자기 자신과의 관계는 self_relation", () => {
        expect(codes([rel("1", "similar_to", "1")])).toContain("self_relation");
    });

    it("알 수 없는 relationType 경고", () => {
        expect(codes([rel("1", "betterthan", "2")])).toContain("unknown_relation_type");
    });

    it("better_than 2-순환 감지", () => {
        const rels = [rel("1", "better_than", "2"), rel("2", "better_than", "1")];
        expect(codes(rels)).toContain("cycle_better_than");
    });

    it("better_than 3-순환 감지", () => {
        const rels = [
            rel("1", "better_than", "2"),
            rel("2", "better_than", "3"),
            rel("3", "better_than", "1"),
        ];
        const warnings = computeWarnings({ hypothesisRelations: rels });
        const cycle = warnings.find((w) => w.code === "cycle_better_than");
        expect(cycle).toBeDefined();
        expect(cycle!.refs.sort()).toEqual(["1", "2", "3"]);
    });

    it("parent_of 순환은 cycle_parent_of", () => {
        const rels = [rel("1", "parent_of", "2"), rel("2", "parent_of", "1")];
        expect(codes(rels)).toContain("cycle_parent_of");
    });

    it("similar_to/conflicts_with 순환은 허용(경고 없음)", () => {
        const rels = [
            rel("1", "similar_to", "2"),
            rel("2", "similar_to", "1"),
            rel("3", "conflicts_with", "4"),
            rel("4", "conflicts_with", "3"),
        ];
        expect(codes(rels)).toEqual([]);
    });

    it("better_than 과 parent_of 순환을 독립적으로 감지", () => {
        const rels = [
            rel("1", "better_than", "2"),
            rel("2", "better_than", "1"),
            rel("5", "parent_of", "6"),
            rel("6", "parent_of", "5"),
        ];
        const c = codes(rels);
        expect(c).toContain("cycle_better_than");
        expect(c).toContain("cycle_parent_of");
    });
});
