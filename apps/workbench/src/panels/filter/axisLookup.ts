// 축 배치줄 → 깔때기가 묻는 두 가지 조회(위치·경계). 순수.
//
// 기존 `rankIndex.buildAxisIndex` 는 타점 키만 색인한다(시트·차트가 타점을 그리므로 그걸로 충분했다).
// 깔때기는 **하루 항목**도 판정해야 해서 차트 키 조회가 하나 더 필요하다.
//
// 배치는 언제나 타점 키로 저장된다 — day scope 축도 place 시 그날 전 타점에 fanout 된다(rankIndex 주석의
// "특례 없음"과 같은 사실). 그래서 하루 항목은 그날 아무 타점이나 집으면 되고, day 축은 그것들이 전부 같은
// orderKey 라 어느 걸 집든 같다.
//
// ⚠ point scope 축을 차트 키로 집으면 그날 **첫** 타점 값이 나온다. 그 일은 일어나지 않는다 — 단계에
// point 축이 있으면 자동 해상도가 타점이 되어 하루 항목 자체가 존재하지 않는다(알갱이 규칙의 불변식).
// 여기서 막지 않는 이유: 막으려면 이 모듈이 축 scope 를 알아야 하는데, 그러면 조회기가 사전에 묶인다.
import type { PlacedPoint } from "@trade-data-manager/wire";
import { chartKey, pointKey } from "../../lib/pointKey.js";

export interface AxisOrderIndex {
    /** 타점 키 → orderKey. 배치된 타점만 키를 가진다(없음 = 미배치). */
    byPoint: Map<string, number>;
    /** 차트 키 → orderKey(그날 첫 배치). 하루 항목 판정용. */
    byChart: Map<string, number>;
    /** slotId → orderKey. 밴드 경계가 "그 자리"를 되찾는 데 쓴다. */
    slots: Map<string, number>;
}

export function buildAxisOrderIndex(line: readonly PlacedPoint[]): AxisOrderIndex {
    const byPoint = new Map<string, number>();
    const byChart = new Map<string, number>();
    const slots = new Map<string, number>();
    for (const p of line) {
        byPoint.set(pointKey(p), p.orderKey);
        if (!byChart.has(chartKey(p))) byChart.set(chartKey(p), p.orderKey);
        if (!slots.has(p.slotId)) slots.set(p.slotId, p.orderKey);
    }
    return { byPoint, byChart, slots };
}

/** 전 축 한 번에 — 축마다 줄이 하나씩 온다(useRankAxes.linesByAxis). */
export const buildAxisOrderIndexes = (linesByAxis: ReadonlyMap<string, PlacedPoint[]>): Map<string, AxisOrderIndex> =>
    new Map([...linesByAxis].map(([axisId, line]) => [axisId, buildAxisOrderIndex(line)]));
