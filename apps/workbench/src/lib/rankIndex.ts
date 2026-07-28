// 축 배치줄 → 타점별 순위 셀. 시트·작업셋·차트가 공유하는 순수 파생(추가 fetch 0).
//  · 셀 = 그 축에서 이 타점의 위치. rank(경쟁순위, 강=1)·total·frac(0약..1강). 미배치 = null.
//  · 관례: 큰 orderKey = 오른쪽 = 강/좋음(RankPanel 과 동일). rank 1 = 가장 강.
//  · day 축은 place 시 그날 전 타점에 fanout 되어 라인에 per-point 로 존재 → point 축과 동일 조립(특례 없음).
import type { PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import { pointKey, type PointKey, type PointRef } from "./pointKey.js";

/** 한 축에서 한 타점의 위치. */
export interface RankCell {
    rank: number; // 경쟁순위(강=1). 나보다 강한(큰 orderKey) 타점 수 + 1. 동점(같은 slot) 공유.
    total: number; // 그 축 총 배치 타점 수(= 분모)
    frac: number; // 0(약/왼쪽)..1(강/오른쪽) — 위치 바용(slot 간 균등)
    slotId: string;
    orderKey: number;
}

/** pk("code|date|time") → 셀. 그 축에 배치된 타점만 키를 가짐. */
export type AxisIndex = Map<PointKey, RankCell>;

/** 한 축 라인(PlacedPoint[]) → pk별 순위 셀. */
export function buildAxisIndex(line: PlacedPoint[]): AxisIndex {
    const idx: AxisIndex = new Map();
    const total = line.length;
    if (total === 0) return idx;

    // slot = orderKey 별 묶음(동점). frac 은 slot 간 균등 위치, rank 는 강한 slot 부터 경쟁순위.
    const countByOK = new Map<number, number>();
    for (const p of line) countByOK.set(p.orderKey, (countByOK.get(p.orderKey) ?? 0) + 1);
    const slotsAsc = [...countByOK.keys()].sort((a, b) => a - b);
    const slotCount = slotsAsc.length;

    // rankByOK: 강(큰 orderKey)부터 경쟁순위. 나보다 강한 타점 수 + 1.
    const rankByOK = new Map<number, number>();
    let strongerPts = 0;
    for (let i = slotsAsc.length - 1; i >= 0; i--) {
        const ok = slotsAsc[i];
        rankByOK.set(ok, strongerPts + 1);
        strongerPts += countByOK.get(ok) ?? 0;
    }
    const fracByOK = new Map<number, number>();
    slotsAsc.forEach((ok, i) => fracByOK.set(ok, slotCount <= 1 ? 0.5 : i / (slotCount - 1)));

    for (const p of line) {
        idx.set(pointKey(p), {
            rank: rankByOK.get(p.orderKey) ?? 1,
            total,
            frac: fracByOK.get(p.orderKey) ?? 0.5,
            slotId: p.slotId,
            orderKey: p.orderKey,
        });
    }
    return idx;
}

/** 한 타점이 한 축에서 차지한 자리(hover 상세 한 줄). */
export interface AxisPlacement {
    axisId: string;
    axisName: string;
    cell: RankCell;
}

/**
 * 타점별 배치 축 수(= 배지의 분자). 전 타점을 한 번에 세어 두고 행마다 Map 조회만 한다.
 * 축이 많아도 비용은 배치 건수 합계(라인 길이 총합) 1회 순회.
 */
export function countPlacedByPoint(indexByAxis: Map<string, AxisIndex>): Map<PointKey, number> {
    const counts = new Map<PointKey, number>();
    for (const idx of indexByAxis.values()) for (const key of idx.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
}

/** 한 타점을 축 전체에 비춘 결과 — 꽂힌 축(강한 순)과 안 꽂힌 축(축 순서). */
export interface PointPlacements {
    placed: AxisPlacement[];
    unplaced: RankAxis[];
}

/**
 * 한 타점의 배치 상세. 정렬 키는 rank 가 아니라 **frac**:
 * rank 는 축마다 분모가 달라(3개 중 1위 vs 200개 중 2위) 축을 가로질러 비교할 수 없다.
 * frac(0..1 상대 위치)이라야 "이 타점의 강점 축 → 약점 축" 순으로 읽힌다. 동률은 축 순서(안정 정렬).
 * 미배치 축도 함께 돌려준다 — "무엇을 아직 안 꽂았나"가 곧 다음 할 일이라 목록의 일부다.
 * 보고 있는 타점 하나에만 도는 온디맨드 계산이라 축 수만큼의 Map 조회로 끝난다.
 */
export function placementsOf(point: PointRef, axes: RankAxis[], indexByAxis: Map<string, AxisIndex>): PointPlacements {
    const key = pointKey(point);
    const placed: AxisPlacement[] = [];
    const unplaced: RankAxis[] = [];
    for (const a of axes) {
        const cell = indexByAxis.get(a.id)?.get(key);
        if (cell) placed.push({ axisId: a.id, axisName: a.name, cell });
        else unplaced.push(a);
    }
    placed.sort((x, y) => y.cell.frac - x.cell.frac);
    return { placed, unplaced };
}
