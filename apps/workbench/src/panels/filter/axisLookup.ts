// 축 줄 → 깔때기가 묻는 조회(위치·경계). 순수.
//
// 행 키가 grain 을 싣는다(2026-08-25 day 소유 재편): point 축 줄 항목 = 타점 키(3조각),
// day 축 줄 항목 = 차트 키(2조각). 두 키 공간이 갈려 **한 맵**이면 충분하고, 조회 쪽이
// "타점 키 → 차트 키" 폴백(rowLookup 과 같은 규칙)으로 두 grain 을 다 잇는다.
//
// ⚠ point 축을 차트 키로 물으면 miss 다(줄에 차트 키가 없다) — 하루 항목이 point 축을 만나는 일 자체가
// 없기도 하다(단계에 point 축이 있으면 자동 해상도가 타점이라 하루 항목이 존재하지 않는다).
import type { PlacedPoint } from "@trade-data-manager/wire";
import { rowKey } from "../../lib/pointKey.js";

/** 행 키(point 축 = 타점 키 · day 축 = 차트 키) → orderKey. 값 있는 행만 키를 가진다. */
export type AxisOrderIndex = Map<string, number>;

export function buildAxisOrderIndex(line: readonly PlacedPoint[]): AxisOrderIndex {
    const m: AxisOrderIndex = new Map();
    for (const p of line) m.set(rowKey(p), p.orderKey);
    return m;
}

/** 전 축 한 번에 — 축마다 줄이 하나씩 온다(useRankAxes.linesByAxis). */
export const buildAxisOrderIndexes = (linesByAxis: ReadonlyMap<string, PlacedPoint[]>): Map<string, AxisOrderIndex> =>
    new Map([...linesByAxis].map(([axisKey, line]) => [axisKey, buildAxisOrderIndex(line)]));
