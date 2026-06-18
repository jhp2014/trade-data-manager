import type { HypothesisRelation, HypothesisSnapshot } from "@/domain/types";

/**
 * 가설 중심 탐색의 case 필터(순수 함수, snapshot 위에서 계산).
 *
 *   결과 = (포함조건 매칭) − (제외조건 매칭)
 *   포함세트 ← includeHypothesisIds + includeTagIds(태그→가설 전개) + better_than 상향전개
 *   매칭     ← OR(아무거나 연결) | AND(모두 연결)
 *   제외     ← excludeHypothesisIds 중 하나라도 연결된 case 제거
 */
export type CaseSearchCriteria = {
    includeHypothesisIds: string[];
    includeTagIds: string[];
    /** 포함 가설 각각에 대해 "그보다 더 좋은 상황"(X better_than H)을 상향 전이로 추가. */
    expandBetterThan: boolean;
    matchMode: "or" | "and";
    excludeHypothesisIds: string[];
};

export type CaseSearchResult = {
    caseId: string;
    linkedHypothesisIds: string[];
};

type SnapshotSlice = Pick<
    HypothesisSnapshot,
    "cases" | "hypothesisCases" | "hypothesisTags" | "hypothesisRelations"
>;

export function searchCases(
    snapshot: SnapshotSlice,
    criteria: CaseSearchCriteria,
): CaseSearchResult[] {
    const caseToHyps = new Map<string, Set<string>>();
    for (const hc of snapshot.hypothesisCases) {
        const set = caseToHyps.get(hc.caseId);
        if (set) set.add(hc.hypothesisId);
        else caseToHyps.set(hc.caseId, new Set([hc.hypothesisId]));
    }

    const includeSet = buildIncludeSet(snapshot, criteria);
    const excludeSet = new Set(criteria.excludeHypothesisIds);

    const results: CaseSearchResult[] = [];
    for (const c of snapshot.cases) {
        const hyps = caseToHyps.get(c.caseId);
        if (!hyps) continue; // 연결된 가설이 없는 case 는 탐색 대상 아님

        if (!matches(hyps, includeSet, criteria.matchMode)) continue;
        if (intersects(hyps, excludeSet)) continue;

        results.push({ caseId: c.caseId, linkedHypothesisIds: [...hyps] });
    }
    return results;
}

function buildIncludeSet(snapshot: SnapshotSlice, criteria: CaseSearchCriteria): Set<string> {
    const set = new Set(criteria.includeHypothesisIds);

    if (criteria.includeTagIds.length > 0) {
        const tagIds = new Set(criteria.includeTagIds);
        for (const ht of snapshot.hypothesisTags) {
            if (tagIds.has(ht.tagId)) set.add(ht.hypothesisId);
        }
    }

    if (criteria.expandBetterThan) {
        return expandBetterThan(set, snapshot.hypothesisRelations);
    }
    return set;
}

/** 각 가설 H에 대해 "X better_than H"인 X를 상향 전이로 모두 추가. */
function expandBetterThan(
    seed: Set<string>,
    relations: HypothesisRelation[],
): Set<string> {
    const betterOf = new Map<string, string[]>();
    for (const r of relations) {
        if (r.relationType !== "better_than") continue;
        const arr = betterOf.get(r.toHypothesisId);
        if (arr) arr.push(r.fromHypothesisId);
        else betterOf.set(r.toHypothesisId, [r.fromHypothesisId]);
    }

    const result = new Set(seed);
    const stack = [...seed];
    while (stack.length > 0) {
        const h = stack.pop()!;
        for (const better of betterOf.get(h) ?? []) {
            if (!result.has(better)) {
                result.add(better);
                stack.push(better);
            }
        }
    }
    return result;
}

function matches(
    caseHyps: Set<string>,
    includeSet: Set<string>,
    mode: "or" | "and",
): boolean {
    if (includeSet.size === 0) return true; // 포함조건 없음 → 전체 통과
    if (mode === "and") {
        for (const h of includeSet) if (!caseHyps.has(h)) return false;
        return true;
    }
    return intersects(caseHyps, includeSet);
}

function intersects(a: Set<string>, b: Set<string>): boolean {
    if (b.size === 0) return false;
    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    for (const x of small) if (large.has(x)) return true;
    return false;
}
