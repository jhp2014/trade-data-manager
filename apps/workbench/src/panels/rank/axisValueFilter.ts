// 계산 축 값 구간 필터(순수) — 날짜·시간과 같은 규칙: **구간끼리 OR, 축끼리 AND**.
// 판단 축 밴드(bandFilter)와 나란히 쓰이지만 좌표계가 다르다: 밴드는 slot 앵커 orderKey, 여기는 축의 원시 수치.
//
// 경계는 대개 **타점 앵커**다(store AxisBound). 그래서 매 렌더 "그 타점의 현재 값"으로 다시 푼다 —
// 수식을 고쳐 값이 통째로 움직여도 "이 타점보다 위"라는 판단이 그대로 유지되는 게 이 한 겹의 목적이다.
//
// 결손(그 축에 값이 없는 타점)은 탈락 — 밴드의 미배치 탈락과 같은 규칙이다("어디 서는지 모름"은 매치가 아니다).
// 앵커 타점이 사라져 경계를 못 풀면 그 **구간만** 버린다(축 전체를 무제한으로 열지 않는다 —
// 조용히 필터가 풀려 결과가 늘어나는 쪽이 더 나쁜 실패라서).
import type { AxisBound, AxisValueRange } from "../../store/rankFilterSlice.js";

/** 풀린 수치 구간. 반열림은 ±Infinity 로 온다. */
export interface ResolvedRange { from: number; to: number }

/** 축 id → (타점키 → 수치). 계산 축만 키를 가진다. */
export type AxisValues = Map<string, Map<string, number>>;

/** 경계 → 수치. 앵커면 그 타점의 **현재** 값. 못 풀면 null. */
export function resolveBound(bound: AxisBound, values: Map<string, number>): number | null {
    if (bound.kind === "value") return Number.isFinite(bound.value) ? bound.value : null;
    return values.get(bound.point) ?? null;
}

/** 한 축의 구간들 → 유효 수치 구간들. 못 푸는 구간은 버린다. 양끝은 정렬해서 돌려준다. */
export function resolveRanges(ranges: readonly AxisValueRange[], values: Map<string, number>): ResolvedRange[] {
    const out: ResolvedRange[] = [];
    for (const r of ranges) {
        if (!r.from && !r.to) continue;
        const lo = r.from ? resolveBound(r.from, values) : -Infinity;
        const hi = r.to ? resolveBound(r.to, values) : Infinity;
        if (lo === null || hi === null) continue; // 앵커 소실 — 이 구간만 버림
        out.push({ from: Math.min(lo, hi), to: Math.max(lo, hi) });
    }
    return out;
}

/** 활성 축 = 풀리는 구간이 하나라도 있는 축. 칩·이름 표시와 필터 적용이 같은 판정을 쓰도록 한 곳에서. */
export function activeValueAxisIds(rangesByAxis: Record<string, AxisValueRange[]>, values: AxisValues): string[] {
    return Object.keys(rangesByAxis).filter((axisId) => resolveRanges(rangesByAxis[axisId] ?? [], values.get(axisId) ?? new Map()).length > 0);
}

/**
 * 타점키 → 통과 여부. 활성 축이 없으면 항상 통과(그 차원 무제한).
 * 축 하나를 미리 다 풀어두고 클로저로 넘겨 행마다 재계산하지 않는다.
 */
export function makeAxisValuePredicate(
    rangesByAxis: Record<string, AxisValueRange[]>,
    values: AxisValues,
): (pointKey: string) => boolean {
    const active: { values: Map<string, number>; ranges: ResolvedRange[] }[] = [];
    for (const axisId of Object.keys(rangesByAxis)) {
        const v = values.get(axisId) ?? new Map<string, number>();
        const ranges = resolveRanges(rangesByAxis[axisId] ?? [], v);
        if (ranges.length > 0) active.push({ values: v, ranges });
    }
    if (active.length === 0) return () => true;
    return (pointKey: string): boolean =>
        active.every((a) => {
            const v = a.values.get(pointKey);
            if (v === undefined) return false; // 결손 = 탈락
            return a.ranges.some((r) => v >= r.from && v <= r.to);
        });
}
