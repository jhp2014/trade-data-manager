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

    it("모르는 relationType 은 더 이상 경고하지 않는다(종류는 클라 소유)", () => {
        expect(codes([rel("1", "betterthan", "2")])).toEqual([]);
    });

    it("방향성 종류의 2-순환 감지", () => {
        const rels = [rel("1", "better_than", "2"), rel("2", "better_than", "1")];
        expect(codes(rels)).toContain("cycle");
    });

    it("방향성 종류의 3-순환 감지", () => {
        const rels = [
            rel("1", "better_than", "2"),
            rel("2", "better_than", "3"),
            rel("3", "better_than", "1"),
        ];
        const warnings = computeWarnings({ hypothesisRelations: rels });
        const cycle = warnings.find((w) => w.code === "cycle");
        expect(cycle).toBeDefined();
        expect(cycle!.refs.sort()).toEqual(["1", "2", "3"]);
    });

    it("무방향 종류(similar_to/conflicts_with)의 순환은 허용", () => {
        const rels = [
            rel("1", "similar_to", "2"),
            rel("2", "similar_to", "1"),
            rel("3", "conflicts_with", "4"),
            rel("4", "conflicts_with", "3"),
        ];
        expect(codes(rels)).toEqual([]);
    });

    it("여러 방향성 종류의 순환을 각각 감지", () => {
        const rels = [
            rel("1", "better_than", "2"),
            rel("2", "better_than", "1"),
            rel("5", "parent_of", "6"),
            rel("6", "parent_of", "5"),
        ];
        expect(codes(rels).filter((c) => c === "cycle")).toHaveLength(2);
    });

    it("directional 집합을 인자로 받아 커스텀 종류도 검사", () => {
        const rels = [rel("1", "custom_dir", "2"), rel("2", "custom_dir", "1")];
        // 기본 집합엔 없으니 경고 없음.
        expect(codes(rels)).toEqual([]);
        // 인자로 넘기면 순환 감지.
        const w = computeWarnings({ hypothesisRelations: rels }, new Set(["custom_dir"]));
        expect(w.map((x) => x.code)).toContain("cycle");
    });
});
