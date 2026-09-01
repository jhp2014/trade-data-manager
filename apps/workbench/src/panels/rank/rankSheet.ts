// 분석 시트 순수 코어 — 축별 순위 셀(lib/rankIndex)을 행으로 접는다. 행은 두 모드:
//  · point 행 = 타점(시각 있음) — 자동 타점 파생물이라 사람이 붙인 속성(옛 결과·메모)이 없다.
//  · day 행 = 후보 하루(시각 없음) — 타점 수·코멘트 유무(존재 지도)가 대신 실린다.
//  · 셀 조립 자체는 시트 전용이 아니어서 lib/rankIndex 로 옮겼다(작업셋 배지·차트 hover 도 같은 셀을 쓴다).
import { rowLookup } from "../../lib/pointKey.js";
import type { AxisIndex, RankCell } from "../../lib/rankIndex.js";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import type { DayPresence } from "../../lib/presence.js";

/** 시트 한 행. 종목명은 안 싣는다 — 표시·정렬 모두 사전(nameOf)이 출처다. */
export interface SheetRow {
    stockCode: string;
    date: string;
    /** HH:MM:SS — point 행에만 있다. **day 행은 (종목,날짜)가 정체성**(계산 축 day grain 과 같은 어휘). */
    time?: string;
    /** day 행 전용 — 그날 자동 타점 수(정의 노브를 그대로 따른다). */
    pointCount?: number;
    /** day 행 전용 — 당일 코멘트 유무. */
    comment?: boolean;
    cells: Record<string, RankCell | null>; // axisId → 셀(값 없음 null)
}

/** 타점들 × 축들 → point 행. axisIds 순서는 표시용(열 순서)과 무관하다 — 셀은 전 축을 채운다. */
export function buildSheetRows(points: readonly ReviewPointKey[], axisIds: string[], indexByAxis: Map<string, AxisIndex>): SheetRow[] {
    return points.map((p) => {
        const cells: Record<string, RankCell | null> = {};
        // day 축 셀은 차트 행에서 온다(그날 전 타점이 같은 셀) — rowLookup 폴백.
        for (const axisId of axisIds) cells[axisId] = rowLookup(indexByAxis.get(axisId), p) ?? null;
        return { stockCode: p.stockCode, date: p.date, time: p.time, cells };
    });
}

/**
 * 후보 하루들 × day 축들 → day 행. 후보 전부가 행이다(값 없는 날 = 빈 셀 = 진도 정보 —
 * 값 있는 날만 보이면 "입력 전"이 안 보인다, 깔때기가 미배치를 안 떨구는 것과 같은 이유).
 */
export function buildDaySheetRows(
    candidates: readonly { stockCode: string; date: string }[],
    axisIds: string[],
    indexByAxis: Map<string, AxisIndex>,
    presenceOf: (c: { stockCode: string; date: string }) => DayPresence | undefined,
    /** 그날 타점 수 — 존재 지도가 아니라 자동 타점 파생에서 온다(타점은 사람 편집물이 아니다). */
    pointCountOf: (c: { stockCode: string; date: string }) => number,
): SheetRow[] {
    return candidates.map((c) => {
        const cells: Record<string, RankCell | null> = {};
        for (const axisId of axisIds) cells[axisId] = rowLookup(indexByAxis.get(axisId), c) ?? null;
        const p = presenceOf(c);
        return { stockCode: c.stockCode, date: c.date, pointCount: pointCountOf(c), comment: p?.comment ?? false, cells };
    });
}
