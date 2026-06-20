import { describe, expect, it } from "vitest";
import { aggregateOutcomes } from "@/services/outcomeAgg";
import type { OutcomeOption } from "@/domain/outcome";
import type { Case } from "@/domain/types";

const OPTIONS: OutcomeOption[] = [
    { value: "win", label: "익절", color: "green" },
    { value: "loss", label: "손절", color: "red" },
];

const mkCase = (caseId: string, outcome: string | null): Pick<Case, "caseId" | "outcome"> => ({
    caseId,
    outcome,
});

describe("aggregateOutcomes", () => {
    it("옵션 순서대로 count>0 만 집계하고 total 은 입력 수", () => {
        const cases = [mkCase("A", "loss"), mkCase("B", "win"), mkCase("C", "win")];
        const { items, total } = aggregateOutcomes({
            caseIds: ["A", "B", "C"],
            cases,
            options: OPTIONS,
        });
        expect(total).toBe(3);
        // options 순서: win 먼저(2), loss(1)
        expect(items).toEqual([
            { key: "win", label: "익절", color: "green", count: 2 },
            { key: "loss", label: "손절", color: "red", count: 1 },
        ]);
    });

    it("null·모르는 value·스냅샷 없는 case 는 미설정 버킷으로 합산해 맨 뒤", () => {
        const cases = [mkCase("A", "win"), mkCase("B", null), mkCase("C", "deleted")];
        const { items } = aggregateOutcomes({
            caseIds: ["A", "B", "C", "D"], // D 는 cases 에 없음 → 미설정
            cases,
            options: OPTIONS,
        });
        expect(items).toEqual([
            { key: "win", label: "익절", color: "green", count: 1 },
            { key: "__none", label: "미설정", color: null, count: 3 },
        ]);
    });

    it("count 0 인 옵션은 빠진다", () => {
        const { items } = aggregateOutcomes({
            caseIds: ["A"],
            cases: [mkCase("A", "win")],
            options: OPTIONS,
        });
        expect(items.map((i) => i.key)).toEqual(["win"]);
    });
});
