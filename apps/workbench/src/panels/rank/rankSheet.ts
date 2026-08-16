// 타점 시트(분석 시트) 순수 코어 — 축별 순위 셀(lib/rankIndex)을 행으로 접고, 선택→밴드를 계산한다.
//  · 셀 조립 자체는 시트 전용이 아니어서 lib/rankIndex 로 옮겼다(작업셋 배지·차트 hover 도 같은 셀을 쓴다).
import { pointKey } from "../../lib/pointKey.js";
import type { AxisIndex, RankCell } from "../../lib/rankIndex.js";
import type { ReviewPointListItem } from "../../api/reviewPoints.js";
import type { RankPoint } from "../../api/rank.js";

/** 시트 한 행 = 타점 + 축별 셀. */
export interface SheetRow {
    stockCode: string;
    date: string;
    time: string;
    name: string | null;
    outcome?: string;
    memo?: string;
    cells: Record<string, RankCell | null>; // axisId → 셀(미배치 null)
}

/** 타점들 × 축들 → 시트 행. axisIds 순서는 표시용(열 순서)과 무관하다 — 셀은 전 축을 채운다. */
export function buildSheetRows(points: ReviewPointListItem[], axisIds: string[], indexByAxis: Map<string, AxisIndex>): SheetRow[] {
    return points.map((p) => {
        const key = pointKey(p);
        const cells: Record<string, RankCell | null> = {};
        for (const axisId of axisIds) cells[axisId] = indexByAxis.get(axisId)?.get(key) ?? null;
        return { stockCode: p.stockCode, date: p.date, time: p.time, name: p.name, outcome: p.outcome, memo: p.memo, cells };
    });
}

/**
 * 정렬 축에서 연속 선택된 행들 → 밴드 앵커(lo=약한 끝, hi=강한 끝). 배치된 셀만 고려. 없으면 null.
 * 경계는 **그 끝에 선 타점**으로 낸다 — 자리(orderKey)는 reindex 가 다시 쓰는 값이라 저장하면 뜻이 변한다.
 */
export function bandFromSelection(rows: { point: RankPoint; cell: RankCell | null }[]): { lo: string; hi: string } | null {
    let lo: { point: RankPoint; cell: RankCell } | null = null;
    let hi: { point: RankPoint; cell: RankCell } | null = null;
    for (const r of rows) {
        if (!r.cell) continue;
        if (!lo || r.cell.orderKey < lo.cell.orderKey) lo = { point: r.point, cell: r.cell };
        if (!hi || r.cell.orderKey > hi.cell.orderKey) hi = { point: r.point, cell: r.cell };
    }
    return lo && hi ? { lo: pointKey(lo.point), hi: pointKey(hi.point) } : null;
}
