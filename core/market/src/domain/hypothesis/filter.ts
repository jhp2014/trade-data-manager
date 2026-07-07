// core/market/domain/hypothesis — 가설↔타점 인메모리 필터(순수). 워크벤치 클라가 import.
// 타점 정체성 = (stockCode, date, time) 삼중키. 링크/타점을 이 키로 매칭한다.
// 직접선택(선택 가설에 연결된 타점)만 여기서 — better_than 전이 등 그래프 확장은 후속(Phase 3).
import type { HypothesisLink } from "./hypothesis.js";

/** 타점 식별 키 = (code|date|time). 링크와 타점을 같은 키로 비교. */
export function pointKey(p: { stockCode: string; date: string; time: string }): string {
    return `${p.stockCode}|${p.date}|${p.time}`;
}

/** 직접선택 필터: 선택 가설들 중 하나라도(OR) 연결된 타점 키 집합. */
export function pointsLinkedToAny(links: HypothesisLink[], hypothesisIds: Iterable<string>): Set<string> {
    const ids = new Set(hypothesisIds);
    const out = new Set<string>();
    for (const l of links) if (ids.has(l.hypothesisId)) out.add(pointKey(l));
    return out;
}

/** 한 타점에 연결된 가설 id 집합(역방향 = 타점→가설). */
export function hypothesesForPoint(
    links: HypothesisLink[],
    point: { stockCode: string; date: string; time: string },
): Set<string> {
    const key = pointKey(point);
    const out = new Set<string>();
    for (const l of links) if (pointKey(l) === key) out.add(l.hypothesisId);
    return out;
}
