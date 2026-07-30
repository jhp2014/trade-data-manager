// 타점 시트(분석 시트) 순수 코어 — 축별 순위 셀(lib/rankIndex)을 행으로 접고, 선택→밴드를 계산한다.
//  · 셀 조립 자체는 시트 전용이 아니어서 lib/rankIndex 로 옮겼다(작업셋 배지·차트 hover 도 같은 셀을 쓴다).
import { pointKey } from "../../lib/pointKey.js";
import type { AxisIndex, RankCell } from "../../lib/rankIndex.js";
import type { ReviewPointListItem } from "../../api/reviewPoints.js";

/** 시트 한 행 = 타점 + 축별 셀 + 커버리지. 분석 열(mfe 등)은 패널이 좁힌 집합에만 붙인다(여긴 배치만). */
export interface SheetRow {
    stockCode: string;
    date: string;
    time: string;
    name: string | null;
    outcome?: string;
    memo?: string;
    cells: Record<string, RankCell | null>; // axisId → 셀(미배치 null)
    coverage: number; // 배치된 축 수
}

/** 타점들 × 축들 → 시트 행. axisIds 순서는 표시용(열 순서)과 무관하게 커버리지 계산엔 전부 포함. */
export function buildSheetRows(points: ReviewPointListItem[], axisIds: string[], indexByAxis: Map<string, AxisIndex>): SheetRow[] {
    return points.map((p) => {
        const key = pointKey(p);
        const cells: Record<string, RankCell | null> = {};
        let coverage = 0;
        for (const axisId of axisIds) {
            const cell = indexByAxis.get(axisId)?.get(key) ?? null;
            cells[axisId] = cell;
            if (cell) coverage++;
        }
        return { stockCode: p.stockCode, date: p.date, time: p.time, name: p.name, outcome: p.outcome, memo: p.memo, cells, coverage };
    });
}

/** 정렬 축에서 연속 선택된 행들 → 밴드 앵커(lo=약한 끝, hi=강한 끝). 배치된 셀만 고려. 없으면 null. */
export function bandFromSelection(cells: (RankCell | null)[]): { lo: string; hi: string } | null {
    let lo: RankCell | null = null;
    let hi: RankCell | null = null;
    for (const c of cells) {
        if (!c) continue;
        if (!lo || c.orderKey < lo.orderKey) lo = c;
        if (!hi || c.orderKey > hi.orderKey) hi = c;
    }
    return lo && hi ? { lo: lo.slotId, hi: hi.slotId } : null;
}
