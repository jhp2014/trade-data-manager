import { describe, it, expect } from "vitest";
import { aggregateByAttr, applyFacet, distinctStockCount } from "../facet.js";
import type { ReviewPoint } from "../reviewPoint.js";

const pt = (stockCode: string, time: string, outcome?: string, type?: string): ReviewPoint => ({
    stockCode,
    date: "2026-06-30",
    time,
    outcome,
    type,
});

describe("review facet (순수)", () => {
    const points: ReviewPoint[] = [
        pt("005930", "09:11:00", "성공", "눌림"),
        pt("005930", "10:00:00", "실패", "돌파"),
        pt("000660", "09:30:00", "성공", "눌림"),
        pt("000660", "11:00:00", undefined, "눌림"), // outcome 미분류
    ];

    it("aggregateByAttr(outcome) — 타점 수 + distinct 종목 수, 미분류 맨 뒤", () => {
        expect(aggregateByAttr(points, "outcome")).toEqual([
            { value: "성공", pointCount: 2, stockCount: 2 },
            { value: "실패", pointCount: 1, stockCount: 1 },
            { value: null, pointCount: 1, stockCount: 1 },
        ]);
    });

    it("aggregateByAttr(type) — 같은 종목 중복 계상", () => {
        // 눌림 = 005930·000660·000660 → 타점 3, 종목 2
        expect(aggregateByAttr(points, "type")).toEqual([
            { value: "눌림", pointCount: 3, stockCount: 2 },
            { value: "돌파", pointCount: 1, stockCount: 1 },
        ]);
    });

    it("applyFacet — 선택 OR, 빈 선택은 전체", () => {
        expect(applyFacet(points, "outcome", new Set())).toEqual(points);
        expect(applyFacet(points, "outcome", new Set(["성공"]))).toEqual([points[0], points[2]]);
        expect(applyFacet(points, "outcome", new Set([null]))).toEqual([points[3]]);
        expect(applyFacet(points, "outcome", new Set(["성공", "실패"]))).toEqual([points[0], points[1], points[2]]);
    });

    it("distinctStockCount", () => {
        expect(distinctStockCount(points)).toBe(2);
    });
});
