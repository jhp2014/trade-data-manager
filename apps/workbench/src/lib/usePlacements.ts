// 타점의 "축 값 현황" 한 벌 — "타점 정보" 패널이 쓴다.
// 축 값 여부만 알려면 어차피 전 축의 줄을 다 당겨야 하고(useRankAxes), 위치(순위·frac)는 같은 데이터의
// 파생이라 사실상 공짜다. (옛 판단축 배지 n/m — axisTotal·countOf — 는 2026-08-25 판단축 폐지로 삭제:
// "무엇을 아직 안 꽂았나"라는 질문 자체가 사라졌다. 값 없는 축은 결손·입력 전이라 목록(미배치 칸)으로만 보인다.)
import { useMemo } from "react";
import { useRankAxes } from "./RankAxesContext.js";
import { buildAxisIndex, placementsOf, type AxisIndex, type PointPlacements } from "./rankIndex.js";
import type { PointRef } from "./pointKey.js";

export interface PlacementsView {
    /** 값이 있는 축(강한 순) + 값 없는 축(결손·입력 전, 축 순서). */
    detailOf: (point: PointRef) => PointPlacements;
}

export function usePlacements(): PlacementsView {
    const { axes, linesByAxis } = useRankAxes();

    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const [axisKey, line] of linesByAxis) m.set(axisKey, buildAxisIndex(line));
        return m;
    }, [linesByAxis]);

    return useMemo(
        () => ({
            detailOf: (p) => placementsOf(p, axes, indexByAxis),
        }),
        [axes, indexByAxis],
    );
}
