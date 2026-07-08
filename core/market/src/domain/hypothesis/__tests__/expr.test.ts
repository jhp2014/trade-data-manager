import { describe, it, expect } from "vitest";
import {
    type HypothesisFilterExpr,
    isFilterActive,
    evalHypothesisFilter,
    filterMembership,
    filterHypothesisIds,
    unknownFilterIds,
    filterPointsByHypothesis,
} from "../expr.js";
import type { HypothesisLink } from "../hypothesis.js";

const leaf = (hypothesisId: string, negated = false) => ({ hypothesisId, negated });

describe("hypothesis filter expr (DNF, 순수)", () => {
    it("isFilterActive — 빈 그룹만 있으면 비활성", () => {
        expect(isFilterActive({ groups: [] })).toBe(false);
        expect(isFilterActive({ groups: [[]] })).toBe(false);
        expect(isFilterActive({ groups: [[leaf("1")]] })).toBe(true);
    });

    it("evalHypothesisFilter — OR of AND", () => {
        // (H1 & H2) | (H3)
        const expr: HypothesisFilterExpr = { groups: [[leaf("1"), leaf("2")], [leaf("3")]] };
        const has = (s: Set<string>) => (id: string) => s.has(id);
        expect(evalHypothesisFilter(expr, has(new Set(["1", "2"])))).toBe(true); // 1군 만족
        expect(evalHypothesisFilter(expr, has(new Set(["1"])))).toBe(false); // 1군 부분·2군 X
        expect(evalHypothesisFilter(expr, has(new Set(["3"])))).toBe(true); // 2군 만족
        expect(evalHypothesisFilter(expr, has(new Set(["4"])))).toBe(false);
    });

    it("evalHypothesisFilter — NOT 리프", () => {
        // (H1 & !H2)
        const expr: HypothesisFilterExpr = { groups: [[leaf("1"), leaf("2", true)]] };
        const has = (s: Set<string>) => (id: string) => s.has(id);
        expect(evalHypothesisFilter(expr, has(new Set(["1"])))).toBe(true);
        expect(evalHypothesisFilter(expr, has(new Set(["1", "2"])))).toBe(false); // H2 있으면 탈락
    });

    it("evalHypothesisFilter — 활성 그룹 없으면 false", () => {
        expect(evalHypothesisFilter({ groups: [[]] }, () => true)).toBe(false);
    });

    it("filterMembership / filterHypothesisIds — 극성 집계", () => {
        const expr: HypothesisFilterExpr = { groups: [[leaf("1"), leaf("2", true)], [leaf("2"), leaf("3", true)]] };
        const m = filterMembership(expr);
        expect(m.get("1")).toEqual({ pos: true, neg: false });
        expect(m.get("2")).toEqual({ pos: true, neg: true }); // 양쪽 등장
        expect(m.get("3")).toEqual({ pos: false, neg: true });
        expect(filterHypothesisIds(expr)).toEqual(new Set(["1", "2", "3"]));
    });

    it("unknownFilterIds — 알 수 없는 가설(삭제 등)", () => {
        const expr: HypothesisFilterExpr = { groups: [[leaf("1"), leaf("9")]] };
        expect(unknownFilterIds(expr, ["1", "2", "3"])).toEqual(["9"]);
    });

    it("filterPointsByHypothesis — 링크로 타점 거르기", () => {
        const links: HypothesisLink[] = [
            { hypothesisId: "1", stockCode: "005930", date: "2026-06-30", time: "09:11:00" },
            { hypothesisId: "2", stockCode: "005930", date: "2026-06-30", time: "09:11:00" },
            { hypothesisId: "1", stockCode: "000660", date: "2026-06-30", time: "10:00:00" },
        ];
        const points = [
            { stockCode: "005930", date: "2026-06-30", time: "09:11:00" }, // {1,2}
            { stockCode: "000660", date: "2026-06-30", time: "10:00:00" }, // {1}
            { stockCode: "000660", date: "2026-06-30", time: "13:00:00" }, // {} (링크 없음)
        ];
        // (H1 & H2) → 첫 타점만
        expect(filterPointsByHypothesis(points, links, { groups: [[leaf("1"), leaf("2")]] })).toEqual([points[0]]);
        // (H1) → 두 타점
        expect(filterPointsByHypothesis(points, links, { groups: [[leaf("1")]] })).toEqual([points[0], points[1]]);
        // (!H1) → 링크에 H1 없는 타점(세 번째)
        expect(filterPointsByHypothesis(points, links, { groups: [[leaf("1", true)]] })).toEqual([points[2]]);
        // 비활성 → 전체 통과
        expect(filterPointsByHypothesis(points, links, { groups: [] })).toEqual(points);
    });
});
