// 배치의 좌표·드롭 판정(순수) — 지금은 **시트(세로 열)** 한 곳뿐이다.
//
// 왜 빼냈나: 드롭 규칙("행 중심 ±8px 안이면 타이", "타이 그룹 내부에 떨어뜨리면 새 slot 이 아니라 합류")은
// 서버가 order_key 를 만들 수 있는지와 직결된다 — 어긋나면 배치가 500 으로 롤백된다(58180f9 참조).
// 컴포넌트 클로저 안에 있으면 테스트가 불가능해서, DOM 측정값만 인자로 받는 순수 함수로 분리했다.
//
// ⚠ 가로 레인(배치 보드) 기하는 그 패널과 함께 사라졌다 — 축을 꽂는 자리는 이제 시트의 정렬 축 열뿐이다.
// slot 묶기(assemble)만 남아 필터 보드의 판단 축 레일이 쓴다.
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { RankPoint, RankTarget } from "../../api/rank.js";
import { pointKey } from "../../lib/pointKey.js";

export const TIE_ROW_PX = 8; // 시트: 행 중심에서 이 거리 안이면 타이(합류)

/**
 * 순위선 한 자리 — 같은 자리에 여러 타점이면 타이.
 * **자리의 식별자는 orderKey**(uq_rank_slot_position 이 축 안 유일성을 보장). 서버에 이 자리를 지목할 땐
 * 여기 든 타점 하나를 쓴다(RankTarget 이 자리를 타점으로 받는다 — slot 은 이름이 없다).
 */
export interface Slot {
    orderKey: number;
    points: RankPoint[];
}

/** 축 라인(PlacedPoint[], orderKey 오름차) → slot 묶음. */
export function assemble(placed: PlacedPoint[]): Slot[] {
    const m = new Map<number, Slot>();
    for (const p of placed) {
        let s = m.get(p.orderKey);
        if (!s) {
            s = { orderKey: p.orderKey, points: [] };
            m.set(p.orderKey, s);
        }
        s.points.push({ stockCode: p.stockCode, date: p.date, time: p.time });
    }
    return [...m.values()].sort((a, b) => a.orderKey - b.orderKey);
}

// ── 시트(세로) 기하 ──────────────────────────────────────────────────────
/** 정렬 축에 배치된 행 하나의 화면 기하(시각 순서대로). */
export interface RowGeom {
    /** 이 행이 선 자리를 서버에 지목할 손잡이 — 그 자리에 든 타점 하나. */
    point: RankPoint;
    orderKey: number;
    top: number;
    bottom: number;
    centerY: number;
}

export interface RowDrop {
    target: RankTarget;
    tie: boolean;
    /** 인디케이터 y — tie 면 행 중심, between 이면 두 행 사이. */
    y: number;
    /** tie 일 때 감쌀 행 범위. */
    rowTop?: number;
    rowBottom?: number;
}

/**
 * 시트 드롭 판정 — 정렬 축 열이 곧 그 축의 세로 순위선일 때, 포인터 y 로 자리를 정한다.
 * @param dir 시트 정렬 방향. 1 = 위가 강(큰 orderKey), -1 = 반대. prev/next 해석이 여기서 뒤집힌다.
 * @param fallbackY 배치된 행이 하나도 없을 때 인디케이터를 둘 y(보통 열 헤더 중앙)
 *
 * **타이 그룹 내부에 떨어뜨리면 사이가 아니라 합류다.** 위/아래 이웃이 같은 slot 이면 둘 사이에
 * 새 order_key 를 만들 수 없다(같은 값) — 서버가 "reindex 후에도 중간키 실패" 로 500 을 낸다.
 */
export function computeRowDrop(placed: RowGeom[], pointerY: number, dir: 1 | -1, fallbackY: number): RowDrop {
    let nearest: RowGeom | null = null;
    for (const p of placed) if (!nearest || Math.abs(p.centerY - pointerY) < Math.abs(nearest.centerY - pointerY)) nearest = p;
    if (nearest && Math.abs(nearest.centerY - pointerY) <= TIE_ROW_PX)
        return { target: { kind: "slot", point: nearest.point }, tie: true, y: nearest.centerY, rowTop: nearest.top, rowBottom: nearest.bottom };

    let above: RowGeom | undefined;
    let below: RowGeom | undefined;
    for (const p of placed) {
        if (p.centerY < pointerY && (!above || p.centerY > above.centerY)) above = p;
        if (p.centerY > pointerY && (!below || p.centerY < below.centerY)) below = p;
    }
    if (above && below && above.orderKey === below.orderKey)
        return { target: { kind: "slot", point: above.point }, tie: true, y: (above.centerY + below.centerY) / 2, rowTop: above.top, rowBottom: below.bottom };

    const prev = dir === 1 ? below : above; // prev = 더 약한(작은 orderKey) 이웃
    const next = dir === 1 ? above : below; // next = 더 강한(큰 orderKey) 이웃
    const y = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom : below ? below.top : fallbackY;
    return { target: { kind: "between", ...(prev ? { after: prev.point } : {}), ...(next ? { before: next.point } : {}) }, tie: false, y };
}

/**
 * 이 자리를 가리킬 **앵커 타점 키** — 자리에 이름이 없으니 든 타점 하나로 지목한다.
 * 밴드 경계 저장·레일 키가 이걸 쓴다(그 타점이 빠지면 경계가 안 풀린다 = 밴드가 깨진 것, 의도된 실패).
 */
export const slotAnchorKey = (s: Slot): string => pointKey(s.points[0]!);
