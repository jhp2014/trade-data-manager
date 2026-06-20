import { parseCaseId } from "@/domain/caseId";
import type { HypothesisSnapshot } from "@/domain/types";
import type { ReviewCase } from "@/repositories/ReviewCaseSource";

/** 워킹셋 한 행 — caseId 스코프에 review 값과 스냅샷 링크 상태를 합친 view 모델. */
export type WorkingSetCase = {
    caseId: string;
    stockCode: string;
    stockName: string | null;
    tradeDate: string;
    tradeTime: string | null;
    /** 케이스 레벨 outcome(트레이드 결과). 스냅샷에만 존재, 미설정이면 null. */
    outcome: string | null;
    /** 케이스 자유 메모. 스냅샷에만 존재, 미설정이면 null. */
    note: string | null;
    /** data-core review_point 에 실재하는가(false = 고아 가능성). */
    existsInReview: boolean;
    /** 이미 연결된 가설 id (스냅샷). 비어있으면 아직 미연결. */
    linkedHypothesisIds: string[];
};

/**
 * caseId 스코프 + review enrich + 스냅샷 링크상태 → 워킹셋 행 목록(순수 함수).
 * 값 우선순위: review(권위) > 스냅샷 > caseId 파싱. 입력 caseIds 순서를 보존한다.
 */
export function buildWorkingSet(params: {
    caseIds: string[];
    reviewCases: ReviewCase[];
    snapshot: Pick<HypothesisSnapshot, "cases" | "hypothesisCases">;
}): WorkingSetCase[] {
    const reviewMap = new Map(params.reviewCases.map((r) => [r.caseId, r]));
    const snapCaseMap = new Map(params.snapshot.cases.map((c) => [c.caseId, c]));

    const linkMap = new Map<string, string[]>();
    for (const hc of params.snapshot.hypothesisCases) {
        const list = linkMap.get(hc.caseId);
        if (list) list.push(hc.hypothesisId);
        else linkMap.set(hc.caseId, [hc.hypothesisId]);
    }

    return params.caseIds.map((caseId) => {
        const review = reviewMap.get(caseId);
        const snap = snapCaseMap.get(caseId);
        const parts = parseCaseId(caseId);
        const partsTime = parts?.tradeTime ? parts.tradeTime.slice(0, 5) : null;

        return {
            caseId,
            stockCode: review?.stockCode ?? snap?.stockCode ?? parts?.stockCode ?? "",
            stockName: review?.stockName ?? snap?.stockName ?? null,
            tradeDate: review?.tradeDate ?? snap?.tradeDate ?? parts?.tradeDate ?? "",
            tradeTime: review?.tradeTime ?? snap?.tradeTime ?? partsTime,
            outcome: snap?.outcome ?? null,
            note: snap?.note ?? null,
            existsInReview: review !== undefined,
            linkedHypothesisIds: linkMap.get(caseId) ?? [],
        };
    });
}
