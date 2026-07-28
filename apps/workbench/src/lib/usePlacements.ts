// 타점의 "배치 현황" 한 벌 — 작업셋 배지·차트 타점 카드가 공유한다.
// 배치 여부만 알려면 어차피 전 축의 줄을 다 당겨야 하고(useRankAxes), 그러면 위치(순위·frac)는 같은 데이터의
// 파생이라 사실상 공짜다. 그래서 여부(count)와 상세(placementsOf)를 한 훅에서 같이 준다.
//   · countOf  — 전 타점 분을 한 번에 세어 둔 Map 조회(작업셋 수백 행에도 O(1)/행).
//   · detailOf — hover/현재 타점 하나에만 도는 온디맨드(축 수만큼 Map 조회).
import { useMemo } from "react";
import { useRankAxes } from "./useRankAxes.js";
import { buildAxisIndex, countPlacedByPoint, placementsOf, type AxisIndex, type PointPlacements } from "./rankIndex.js";
import { pointKey, type PointRef } from "./pointKey.js";

export interface PlacementsView {
    /** 축 총수(= 배지의 분모). 0 이면 배치 기능을 아직 안 쓰는 상태 → 호출부가 배지를 숨긴다. */
    axisTotal: number;
    /** 이 타점이 배치된 축 수. */
    countOf: (point: PointRef) => number;
    /** 배치된 축(강한 순) + 미배치 축(축 순서). */
    detailOf: (point: PointRef) => PointPlacements;
}

export function usePlacements(): PlacementsView {
    const { axes, linesByAxis } = useRankAxes();

    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const [axisId, line] of linesByAxis) m.set(axisId, buildAxisIndex(line));
        return m;
    }, [linesByAxis]);
    const counts = useMemo(() => countPlacedByPoint(indexByAxis), [indexByAxis]);

    return useMemo(
        () => ({
            axisTotal: axes.length,
            countOf: (p) => counts.get(pointKey(p)) ?? 0,
            detailOf: (p) => placementsOf(p, axes, indexByAxis),
        }),
        [axes, counts, indexByAxis],
    );
}
