// 축 배치줄 → 타점별 순위 셀. 시트·작업셋·차트가 공유하는 순수 파생(추가 fetch 0).
//  · 셀 = 그 축에서 이 타점의 위치. rank(자리 번호, 강=1)·total(slot 수)·frac(0약..1강). 미배치 = null.
//  · 관례: 큰 orderKey = 오른쪽 = 강/좋음(RankPanel 과 동일). rank 1 = 가장 강.
//  · day 축의 줄 항목은 **차트 행**(time 없음, 키 = chartKey) — 타점 조회는 rowLookup 폴백이 잇는다.
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { AxisRef } from "./computedAxis.js";
import { rowKey, rowLookup, type PointKey, type PointRef } from "./pointKey.js";

/**
 * 한 축에서 한 타점의 위치.
 * **세는 단위는 타점이 아니라 slot(줄 위의 자리)**: 같은 자리에 여러 타점이 있어도 한 칸으로 본다
 * (레인에 점이 5개면 언제나 n/5). 타점 수로 세면 타이가 낄 때마다 분모가 뛰고 순위가 건너뛰어
 * 눈으로 보는 줄과 숫자가 어긋난다.
 */
export interface RankCell {
    rank: number; // 강한 쪽부터 센 자리 번호(강=1). 같은 자리면 같은 번호, 건너뜀 없음.
    total: number; // 그 축의 자리 수(= 분모, 줄 위의 점 개수)
    frac: number; // 0(약/왼쪽)..1(강/오른쪽) — 위치 바용(자리 간 균등)
    /** 자리 식별자이자 정렬 키. uq_rank_slot_position 덕에 **같은 orderKey = 같은 자리**라 slotId 가 필요 없다. */
    orderKey: number;
}

/** 행 키(point 축 = "code|date|time" · day 축 = "code|date") → 셀. 값 있는 행만 키를 가짐. */
export type AxisIndex = Map<PointKey, RankCell>;

/** 한 축 라인(PlacedPoint[]) → pk별 순위 셀. 세는 단위는 slot(위 RankCell 주석). */
export function buildAxisIndex(line: PlacedPoint[]): AxisIndex {
    const idx: AxisIndex = new Map();
    if (line.length === 0) return idx;

    // slot = orderKey 별 묶음(타이). 약→강 순으로 늘어놓고, 번호는 강한 끝에서부터 1.
    const slotsAsc = [...new Set(line.map((p) => p.orderKey))].sort((a, b) => a - b);
    const total = slotsAsc.length;

    const rankByOK = new Map<number, number>();
    const fracByOK = new Map<number, number>();
    slotsAsc.forEach((ok, i) => {
        rankByOK.set(ok, total - i); // 마지막(가장 강)이 1
        fracByOK.set(ok, total <= 1 ? 0.5 : i / (total - 1));
    });

    for (const p of line) {
        idx.set(rowKey(p), {
            rank: rankByOK.get(p.orderKey) ?? 1,
            total,
            frac: fracByOK.get(p.orderKey) ?? 0.5,
            orderKey: p.orderKey,
        });
    }
    return idx;
}

/**
 * 한 축 라인의 **타점키 → orderKey**. 밴드·컷 경계가 "그 자리"를 되찾는 데 쓴다.
 * 옛 slotOrderKeys(slotId→orderKey)를 대신한다 — 경계를 타점으로 저장하게 되면서 지목 방향이 바뀌었다.
 */
export function orderKeyByPoint(line: PlacedPoint[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const p of line) m.set(rowKey(p), p.orderKey);
    return m;
}

/** 한 타점이 한 축에서 차지한 자리(hover 상세 한 줄). */
export interface AxisPlacement {
    /** 축의 클라 키(`p:<이름>`·`c:<키>`) — "저 축 보여줘" 같은 축 지목은 이름이 아니라 이걸 쓴다(시트 열 키와 같은 좌표). */
    axisKey: string;
    axisName: string;
    cell: RankCell;
}

/** 한 타점을 축 전체에 비춘 결과 — 꽂힌 축(강한 순)과 안 꽂힌 축(축 순서). */
export interface PointPlacements {
    placed: AxisPlacement[];
    unplaced: AxisRef[];
}

/**
 * 한 타점의 배치 상세. 정렬 키는 rank 가 아니라 **frac**:
 * rank 는 축마다 분모가 달라(3개 중 1위 vs 200개 중 2위) 축을 가로질러 비교할 수 없다.
 * frac(0..1 상대 위치)이라야 "이 타점의 강점 축 → 약점 축" 순으로 읽힌다. 동률은 축 순서(안정 정렬).
 * 미배치 축도 함께 돌려준다 — "무엇을 아직 안 꽂았나"가 곧 다음 할 일이라 목록의 일부다.
 * 보고 있는 타점 하나에만 도는 온디맨드 계산이라 축 수만큼의 Map 조회로 끝난다.
 */
export function placementsOf(point: PointRef, axes: AxisRef[], indexByAxis: Map<string, AxisIndex>): PointPlacements {
    const placed: AxisPlacement[] = [];
    const unplaced: AxisRef[] = [];
    for (const a of axes) {
        const cell = rowLookup(indexByAxis.get(a.key), point); // day 축은 차트 행 — 폴백이 닿는다
        if (cell) placed.push({ axisKey: a.key, axisName: a.name, cell });
        else unplaced.push(a);
    }
    placed.sort((x, y) => y.cell.frac - x.cell.frac);
    return { placed, unplaced };
}
