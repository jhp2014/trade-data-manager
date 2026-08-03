// 타점의 "배치 현황" 한 벌 — 작업셋 배지·차트 타점 카드가 공유한다.
// 배치 여부만 알려면 어차피 전 축의 줄을 다 당겨야 하고(useRankAxes), 그러면 위치(순위·frac)는 같은 데이터의
// 파생이라 사실상 공짜다. 그래서 여부(count)와 상세(placementsOf)를 한 훅에서 같이 준다.
//   · countOf  — 전 타점 분을 한 번에 세어 둔 Map 조회(작업셋 수백 행에도 O(1)/행).
//   · detailOf — hover/현재 타점 하나에만 도는 온디맨드(축 수만큼 Map 조회).
//
// 계산 축은 **상세에만** 넣고 배지에서는 뺀다. 배지가 답하는 질문은 "무엇을 아직 안 꽂았나"(= 다음 할 일)인데,
// 계산 축은 꽂을 일이 없으니 분모에 들어가면 그 뜻이 흐려진다(늘 채워져 있어 진척처럼 보인다).
// 반대로 상세(강점 축 → 약점 축 프로파일)는 계산 축이 들어갈수록 정보가 는다 — frac 정렬이라 그대로 섞인다.
// 계산 축의 결손도 "안 꽂음"이 아니라 "재료 없음"이라 미배치 목록에서 뺀다.
import { useMemo } from "react";
import { useRankAxes } from "./useRankAxes.js";
import { isComputedAxis } from "./computedAxis.js";
import { buildAxisIndex, countPlacedByPoint, placementsOf, type AxisIndex, type PointPlacements } from "./rankIndex.js";
import { pointKey, type PointRef } from "./pointKey.js";

export interface PlacementsView {
    /** 판단 축 총수(= 배지의 분모). 0 이면 배치 기능을 아직 안 쓰는 상태 → 호출부가 배지를 숨긴다. */
    axisTotal: number;
    /** 이 타점이 배치된 **판단 축** 수. */
    countOf: (point: PointRef) => number;
    /** 값이 있는 축(계산 축 포함, 강한 순) + 아직 안 꽂은 판단 축(축 순서). */
    detailOf: (point: PointRef) => PointPlacements;
}

export function usePlacements(): PlacementsView {
    const { axes, linesByAxis } = useRankAxes({ includeComputed: true });

    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const [axisId, line] of linesByAxis) m.set(axisId, buildAxisIndex(line));
        return m;
    }, [linesByAxis]);

    const judgedAxes = useMemo(() => axes.filter((a) => !isComputedAxis(a.id)), [axes]);
    const judgedIndex = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const a of judgedAxes) m.set(a.id, indexByAxis.get(a.id) ?? new Map());
        return m;
    }, [judgedAxes, indexByAxis]);
    const counts = useMemo(() => countPlacedByPoint(judgedIndex), [judgedIndex]);

    return useMemo(
        () => ({
            axisTotal: judgedAxes.length,
            countOf: (p) => counts.get(pointKey(p)) ?? 0,
            detailOf: (p) => {
                const all = placementsOf(p, axes, indexByAxis);
                return { placed: all.placed, unplaced: all.unplaced.filter((a) => !isComputedAxis(a.id)) };
            },
        }),
        [axes, judgedAxes, counts, indexByAxis],
    );
}
