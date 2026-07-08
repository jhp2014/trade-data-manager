// core/market/domain/hypothesis — 가설 필터식(워크벤치 블럭 빌더가 생성) + 평가.
// **DNF 2단계**: 리프(가설 id + 부정)를 AND 그룹으로 묶고, 그룹들을 OR. 임의 boolean 을 다 표현하되
// UI 빌딩/렌더가 단순(중첩 없음). 리프 = 가설 id **직접**(사용자가 타이핑 안 하므로 코드/파서 불필요 — 옛 hypExpr 의
// tokenizer/parser·codeToId 매핑 소멸). 저장은 curation.hypothesis_filters(expr jsonb).
import type { HypothesisLink } from "./hypothesis.js";
import { pointKey, linksByPoint } from "./filter.js";

/** 필터 리프 = 가설 하나 + 부정 여부(NOT). */
export interface FilterLeaf {
    hypothesisId: string;
    negated: boolean;
}
/** AND 그룹 = 리프들의 논리곱. */
export type FilterGroup = FilterLeaf[];
/** 가설 필터식 = AND 그룹들의 논리합(DNF, "이 조합들 중 아무거나"). */
export interface HypothesisFilterExpr {
    groups: FilterGroup[];
}

export const EMPTY_FILTER: HypothesisFilterExpr = { groups: [] };

/** 저장된 가설 필터(curation.hypothesis_filters). 이름으로 저장/불러오기, expr 은 위 DNF 식. */
export interface HypothesisFilter {
    id?: string; // surrogate(bigint). 미저장이면 undefined.
    name: string;
    expr: HypothesisFilterExpr;
    createdAt?: string; // ISO. 조회 후 존재.
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** 비어있지 않은(=평가 대상) 그룹이 하나라도 있나. 없으면 필터 비활성(작업셋 월별 모드 유지). */
export function isFilterActive(expr: HypothesisFilterExpr): boolean {
    return expr.groups.some((g) => g.length > 0);
}

/**
 * hasId(id) = "이 타점이 그 가설에 연결됐나". 비어있지 않은 그룹 중 하나라도 전부 만족하면 통과(OR of AND).
 * 빈 그룹은 건너뜀(전체통과로 오해 방지). 활성 그룹이 없으면 false(클라는 비활성 시 애초에 미적용).
 */
export function evalHypothesisFilter(expr: HypothesisFilterExpr, hasId: (id: string) => boolean): boolean {
    for (const g of expr.groups) {
        if (g.length === 0) continue;
        if (g.every((l) => (l.negated ? !hasId(l.hypothesisId) : hasId(l.hypothesisId)))) return true;
    }
    return false;
}

/** 필터에 등장하는 가설 id 별 극성(양성/음성 어느 쪽으로 등장했나). 그래프 링 색칠용(neg-only=빨강). */
export function filterMembership(expr: HypothesisFilterExpr): Map<string, { pos: boolean; neg: boolean }> {
    const m = new Map<string, { pos: boolean; neg: boolean }>();
    for (const g of expr.groups)
        for (const l of g) {
            const e = m.get(l.hypothesisId) ?? { pos: false, neg: false };
            if (l.negated) e.neg = true;
            else e.pos = true;
            m.set(l.hypothesisId, e);
        }
    return m;
}

/** 필터에 등장하는 가설 id 집합. */
export function filterHypothesisIds(expr: HypothesisFilterExpr): Set<string> {
    return new Set(filterMembership(expr).keys());
}

/** 필터의 id 중 knownIds 에 없는 것(삭제된 가설 등). UI 경고·저장 필터 degrade 용. */
export function unknownFilterIds(expr: HypothesisFilterExpr, knownIds: Iterable<string>): string[] {
    const known = new Set(knownIds);
    return [...filterHypothesisIds(expr)].filter((id) => !known.has(id));
}

/**
 * 파이프라인 1단계: 필터식을 만족하는 타점만. 타점 정체성 = (stockCode,date,time).
 * 비활성 필터면 전체 통과(안전 — 클라가 월별 모드로 안 부르는 게 정상). 링크는 1패스로 타점→가설 맵 선계산.
 */
export function filterPointsByHypothesis<P extends { stockCode: string; date: string; time: string }>(
    points: P[],
    links: HypothesisLink[],
    expr: HypothesisFilterExpr,
): P[] {
    if (!isFilterActive(expr)) return points;
    const byPoint = linksByPoint(links);
    return points.filter((p) => {
        const hyps = byPoint.get(pointKey(p)) ?? EMPTY_SET;
        return evalHypothesisFilter(expr, (id) => hyps.has(id));
    });
}
