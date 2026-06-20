import { describe, expect, it } from "vitest";
import { buildWorkingSet } from "@/services/workingSet";
import type { Case, HypothesisCase } from "@/domain/types";
import type { ReviewCase } from "@/repositories/ReviewCaseSource";

const reviewCase = (over: Partial<ReviewCase> & { caseId: string }): ReviewCase => ({
    stockCode: "055550",
    stockName: "신한지주",
    tradeDate: "2026-06-05",
    tradeTime: "09:11",
    ...over,
});

const snapCase = (over: Partial<Case> & { caseId: string }): Case => ({
    stockCode: "055550",
    stockName: "스냅이름",
    tradeDate: "2026-06-05",
    tradeTime: "09:11",
    outcome: null,
    extra: {},
    ...over,
});

const link = (hypothesisId: string, caseId: string): HypothesisCase => ({
    id: `${hypothesisId}-${caseId}`,
    hypothesisId,
    caseId,
    note: null,
    extra: {},
});

describe("buildWorkingSet", () => {
    it("review 값과 링크 상태를 합친다", () => {
        const caseId = "055550-2026-06-05-0911";
        const result = buildWorkingSet({
            caseIds: [caseId],
            reviewCases: [reviewCase({ caseId })],
            snapshot: { cases: [], hypothesisCases: [link("1", caseId), link("2", caseId)] },
        });
        expect(result[0]).toEqual({
            caseId,
            stockCode: "055550",
            stockName: "신한지주",
            tradeDate: "2026-06-05",
            tradeTime: "09:11",
            outcome: null,
            existsInReview: true,
            linkedHypothesisIds: ["1", "2"],
        });
    });

    it("review 에 없으면 existsInReview=false, 값은 스냅샷에서", () => {
        const caseId = "055550-2026-06-05-0911";
        const result = buildWorkingSet({
            caseIds: [caseId],
            reviewCases: [],
            snapshot: { cases: [snapCase({ caseId })], hypothesisCases: [] },
        });
        expect(result[0]).toMatchObject({
            existsInReview: false,
            stockName: "스냅이름",
            linkedHypothesisIds: [],
        });
    });

    it("review·스냅샷 모두 없으면 caseId 파싱으로 채우고 stockName 은 null", () => {
        const caseId = "005930-2026-06-10-1320";
        const result = buildWorkingSet({
            caseIds: [caseId],
            reviewCases: [],
            snapshot: { cases: [], hypothesisCases: [] },
        });
        expect(result[0]).toEqual({
            caseId,
            stockCode: "005930",
            stockName: null,
            tradeDate: "2026-06-10",
            tradeTime: "13:20",
            outcome: null,
            existsInReview: false,
            linkedHypothesisIds: [],
        });
    });

    it("입력 caseIds 순서를 보존한다", () => {
        const result = buildWorkingSet({
            caseIds: ["005930-2026-06-10-1320", "055550-2026-06-05-0911"],
            reviewCases: [],
            snapshot: { cases: [], hypothesisCases: [] },
        });
        expect(result.map((r) => r.caseId)).toEqual([
            "005930-2026-06-10-1320",
            "055550-2026-06-05-0911",
        ]);
    });
});
