// 타점 시트(분석 시트) 순수 코어 — 축 라인에서 타점별 순위 셀을 조립하고, 정렬·기간·선택→밴드를 계산한다.
//  · 셀 = 그 축에서 이 타점의 위치. rank(경쟁순위, 강=1)·total·frac(0약..1강). 미배치 = null.
//  · 관례: 큰 orderKey = 오른쪽 = 강/좋음(RankPanel 과 동일). rank 1 = 가장 강.
//  · day 축은 place 시 그날 전 타점에 fanout 되어 라인에 per-point 로 존재 → point 축과 동일 조립(특례 없음).
//  · 순위 숫자·위치 바 모두 이미 당긴 축 라인에서 파생(추가 fetch/연산 없음, 사실상 0 비용).
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { ReviewPointListItem } from "../../api/reviewPoints.js";

/** 한 축에서 한 타점의 위치. */
export interface RankCell {
    rank: number; // 경쟁순위(강=1). 나보다 강한(큰 orderKey) 타점 수 + 1. 동점(같은 slot) 공유.
    total: number; // 그 축 총 배치 타점 수(= 분모)
    frac: number; // 0(약/왼쪽)..1(강/오른쪽) — 위치 바용(slot 간 균등)
    slotId: string;
    orderKey: number;
}

/** pk("code|date|time") → 셀. 그 축에 배치된 타점만 키를 가짐. */
export type AxisIndex = Map<string, RankCell>;

export const pkOf = (p: { stockCode: string; date: string; time: string }): string => `${p.stockCode}|${p.date}|${p.time}`;

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
        idx.set(pkOf(p), {
            rank: rankByOK.get(p.orderKey) ?? 1,
            total,
            frac: fracByOK.get(p.orderKey) ?? 0.5,
            slotId: p.slotId,
            orderKey: p.orderKey,
        });
    }
    return idx;
}

/** 시트 한 행 = 타점 + 축별 셀 + 커버리지. 분석 열(mfe 등)은 패널이 좁힌 집합에만 붙인다(여긴 배치만). */
export interface SheetRow {
    stockCode: string;
    date: string;
    time: string;
    name: string | null;
    outcome?: string;
    type?: string;
    memo?: string;
    cells: Record<string, RankCell | null>; // axisId → 셀(미배치 null)
    coverage: number; // 배치된 축 수
}

/** 타점들 × 축들 → 시트 행. axisIds 순서는 표시용(열 순서)과 무관하게 커버리지 계산엔 전부 포함. */
export function buildSheetRows(points: ReviewPointListItem[], axisIds: string[], indexByAxis: Map<string, AxisIndex>): SheetRow[] {
    return points.map((p) => {
        const key = pkOf(p);
        const cells: Record<string, RankCell | null> = {};
        let coverage = 0;
        for (const axisId of axisIds) {
            const cell = indexByAxis.get(axisId)?.get(key) ?? null;
            cells[axisId] = cell;
            if (cell) coverage++;
        }
        return { stockCode: p.stockCode, date: p.date, time: p.time, name: p.name, outcome: p.outcome, type: p.type, memo: p.memo, cells, coverage };
    });
}

export const monthOf = (date: string): string => date.slice(0, 7);

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
