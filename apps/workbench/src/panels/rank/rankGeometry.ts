// 순위 배치의 좌표·드롭 판정 (순수) — 배치 보드(가로 레인)와 시트(세로 열) 두 입력 방식을 여기 모은다.
//
// 왜 빼냈나: 드롭 규칙("±8px 안이면 타이", "타이 그룹 내부에 떨어뜨리면 새 slot 이 아니라 합류")은
// 서버가 order_key 를 만들 수 있는지와 직결된다 — 어긋나면 배치가 500 으로 롤백된다(58180f9 참조).
// 컴포넌트 클로저 안에 있으면 테스트가 불가능해서, DOM 측정값만 인자로 받는 순수 함수로 분리했다.
// 호출부는 getBoundingClientRect 로 숫자를 재서 넘기는 일만 한다.
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { RankPoint, RankTarget } from "../../api/rank.js";

// ── 레인(가로) 기하 ──────────────────────────────────────────────────────
export const PAD = 52; // 스팟 좌우 여백(px) — 끝 스팟이 라인 끝 가까이(오버런 = PAD−LINE_PAD 만큼만)
export const LINE_PAD = 32; // 축 라인 여백(고정, PAD 와 독립)
export const TIE_PX = 14; // 레인: 스팟 중심에서 이 거리 안이면 타이(합류)
export const TIE_ROW_PX = 8; // 시트: 행 중심에서 이 거리 안이면 타이

/** 한 축의 표시 구간(줌). 0..1 전체가 기본. */
export interface View {
    v0: number;
    v1: number;
}

/** 순위선 한 자리 — 같은 slot 에 여러 타점이면 타이. */
export interface Slot {
    slotId: string;
    orderKey: number;
    points: RankPoint[];
}

/** 축 라인(PlacedPoint[], orderKey 오름차) → slot 묶음. */
export function assemble(placed: PlacedPoint[]): Slot[] {
    const m = new Map<string, Slot>();
    for (const p of placed) {
        let s = m.get(p.slotId);
        if (!s) {
            s = { slotId: p.slotId, orderKey: p.orderKey, points: [] };
            m.set(p.slotId, s);
        }
        s.points.push({ stockCode: p.stockCode, date: p.date, time: p.time });
    }
    return [...m.values()].sort((a, b) => a.orderKey - b.orderKey);
}

/** i번째 slot 의 0..1 위치(slot 간 균등). 하나뿐이면 가운데. */
export const slotFrac = (i: number, count: number): number => (count <= 1 ? 0.5 : i / (count - 1));

/** 0..1 위치 → 현재 뷰(줌) 기준 0..1. 뷰 밖이면 음수/1 초과. */
export const displayU = (frac: number, v: View): number => (frac - v.v0) / (v.v1 - v.v0);

export const isZoomed = (v: View): boolean => v.v0 > 0.001 || v.v1 < 0.999;

/**
 * 커서 지점 확대/축소 — t(0..1, 트랙 내 커서 위치)를 고정점으로 창을 좁히거나 넓힌다.
 * 양 끝에 닿으면 창을 안쪽으로 밀어 넣어(0..1 밖으로 안 나가게) 폭을 유지한다.
 */
export function zoomAt(view: View, t: number, deltaY: number): View {
    const width = view.v1 - view.v0;
    const anchor = view.v0 + t * width;
    const nw = Math.max(0.1, Math.min(1, width * (deltaY < 0 ? 0.82 : 1.22)));
    let v0 = anchor - t * nw;
    let v1 = v0 + nw;
    if (v0 < 0) {
        v0 = 0;
        v1 = nw;
    }
    if (v1 > 1) {
        v1 = 1;
        v0 = 1 - nw;
    }
    return { v0, v1 };
}

export interface LaneDrop {
    /** 인디케이터 위치(트랙 폭 대비 %). 끝 바깥으로 살짝 넘칠 수 있게 −8..108 로 클램프. */
    leftPct: number;
    tie: boolean;
    target: RankTarget;
}

/**
 * 레인 드롭 판정 — 포인터 x 로 "어느 자리에 놓는가".
 * @param slots 그 축의 slot(orderKey 오름차)
 * @param offsetX 트랙 요소 왼쪽 기준 포인터 x(px)
 * @param width  트랙 요소 전체 폭(px)
 *
 * 가장 가까운 스팟이 TIE_PX 안이면 그 slot 에 합류(타이), 아니면 좌우 이웃 사이(between).
 * between 의 prev/next 가 둘 다 없으면(빈 축) 끝단 — 서버가 첫 order_key 를 만든다.
 */
export function computeLaneDrop(slots: Slot[], view: View, offsetX: number, width: number): LaneDrop {
    const trackW = width - 2 * PAD;
    const uPtr = (offsetX - PAD) / trackW;
    const nodes = slots.map((s, i) => ({ s, u: displayU(slotFrac(i, slots.length), view) }));

    let near: { s: Slot; u: number; d: number } | null = null;
    for (const n of nodes) {
        const d = Math.abs(PAD + n.u * trackW - offsetX);
        if (near == null || d < near.d) near = { s: n.s, u: n.u, d };
    }
    if (near && near.d <= TIE_PX) return { leftPct: near.u * 100, tie: true, target: { kind: "slot", slotId: near.s.slotId } };

    let prev: Slot | undefined;
    let next: Slot | undefined;
    for (const n of nodes) {
        if (n.u <= uPtr) prev = n.s;
        else {
            next = n.s;
            break;
        }
    }
    return {
        leftPct: Math.max(-8, Math.min(108, uPtr * 100)),
        tie: false,
        target: { kind: "between", prevSlotId: prev?.slotId, nextSlotId: next?.slotId },
    };
}

// ── 시트(세로) 기하 ──────────────────────────────────────────────────────
/** 정렬 축에 배치된 행 하나의 화면 기하(시각 순서대로). */
export interface RowGeom {
    slotId: string;
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
        return { target: { kind: "slot", slotId: nearest.slotId }, tie: true, y: nearest.centerY, rowTop: nearest.top, rowBottom: nearest.bottom };

    let above: RowGeom | undefined;
    let below: RowGeom | undefined;
    for (const p of placed) {
        if (p.centerY < pointerY && (!above || p.centerY > above.centerY)) above = p;
        if (p.centerY > pointerY && (!below || p.centerY < below.centerY)) below = p;
    }
    if (above && below && above.slotId === below.slotId)
        return { target: { kind: "slot", slotId: above.slotId }, tie: true, y: (above.centerY + below.centerY) / 2, rowTop: above.top, rowBottom: below.bottom };

    const prev = dir === 1 ? below : above; // prev = 더 약한(작은 orderKey) 이웃
    const next = dir === 1 ? above : below; // next = 더 강한(큰 orderKey) 이웃
    const y = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom : below ? below.top : fallbackY;
    return { target: { kind: "between", prevSlotId: prev?.slotId, nextSlotId: next?.slotId }, tie: false, y };
}
