import { describe, expect, it } from "vitest";
import { searchCases, type CaseSearchCriteria } from "@/services/caseSearch";
import type {
    Case,
    HypothesisCase,
    HypothesisRelation,
    HypothesisTag,
} from "@/domain/types";

const mkCase = (caseId: string): Case => ({
    caseId,
    stockCode: caseId.slice(0, 6),
    stockName: null,
    tradeDate: "2026-06-05",
    tradeTime: null,
    extra: {},
});

const link = (hypothesisId: string, caseId: string): HypothesisCase => ({
    id: `${hypothesisId}-${caseId}`,
    hypothesisId,
    caseId,
    outcome: null,
    note: null,
    extra: {},
});

const rel = (from: string, type: string, to: string): HypothesisRelation => ({
    id: `${from}-${type}-${to}`,
    fromHypothesisId: from,
    toHypothesisId: to,
    relationType: type,
    note: null,
});

const tag = (hypothesisId: string, tagId: string): HypothesisTag => ({ hypothesisId, tagId });

// case A: H1, H2 / B: H2 / C: H3 / D: H1,H3
const SNAP = {
    cases: ["A", "B", "C", "D"].map(mkCase),
    hypothesisCases: [
        link("H1", "A"), link("H2", "A"),
        link("H2", "B"),
        link("H3", "C"),
        link("H1", "D"), link("H3", "D"),
    ],
    hypothesisTags: [tag("H1", "T1"), tag("H3", "T1"), tag("H2", "T2")],
    hypothesisRelations: [rel("H2", "better_than", "H1"), rel("H4", "better_than", "H2")],
};

const base: CaseSearchCriteria = {
    includeHypothesisIds: [],
    includeTagIds: [],
    expandBetterThan: false,
    matchMode: "or",
    excludeHypothesisIds: [],
};

const ids = (snap: typeof SNAP, c: CaseSearchCriteria) =>
    searchCases(snap, c).map((r) => r.caseId).sort();

describe("searchCases", () => {
    it("포함조건 없으면 전체(연결된 case)", () => {
        expect(ids(SNAP, base)).toEqual(["A", "B", "C", "D"]);
    });

    it("OR — 아무 가설이나 연결된 case", () => {
        expect(ids(SNAP, { ...base, includeHypothesisIds: ["H1"] })).toEqual(["A", "D"]);
        expect(ids(SNAP, { ...base, includeHypothesisIds: ["H1", "H2"] })).toEqual(["A", "B", "D"]);
    });

    it("AND — 모든 가설이 연결된 case", () => {
        expect(ids(SNAP, { ...base, matchMode: "and", includeHypothesisIds: ["H1", "H3"] })).toEqual(["D"]);
        expect(ids(SNAP, { ...base, matchMode: "and", includeHypothesisIds: ["H1", "H2"] })).toEqual(["A"]);
    });

    it("제외(NOT) — 해당 가설이 연결된 case 제거", () => {
        expect(ids(SNAP, { ...base, excludeHypothesisIds: ["H3"] })).toEqual(["A", "B"]);
        expect(
            ids(SNAP, { ...base, includeHypothesisIds: ["H1"], excludeHypothesisIds: ["H3"] }),
        ).toEqual(["A"]);
    });

    it("태그 전개 — 태그의 가설들 OR", () => {
        // T1 = {H1, H3} → cases A,D(H1) ∪ C,D(H3) = A,C,D
        expect(ids(SNAP, { ...base, includeTagIds: ["T1"] })).toEqual(["A", "C", "D"]);
    });

    it("better_than 상향전개 — H1 선택 시 H2(>H1)·H4(>H2)도 OR", () => {
        // 전개 전 H1 → A,D. 전개 후 {H1,H2,H4} → A,D + B(H2) = A,B,D
        expect(
            ids(SNAP, { ...base, includeHypothesisIds: ["H1"], expandBetterThan: true }),
        ).toEqual(["A", "B", "D"]);
    });

    it("linkedHypothesisIds 를 함께 반환", () => {
        const a = searchCases(SNAP, { ...base, includeHypothesisIds: ["H1"] }).find((r) => r.caseId === "A");
        expect(a?.linkedHypothesisIds.sort()).toEqual(["H1", "H2"]);
    });
});
