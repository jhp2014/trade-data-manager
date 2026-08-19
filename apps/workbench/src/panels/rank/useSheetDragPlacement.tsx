// ── 드래그 배치(고정 행 → 정렬된 축 열) ─────────────────────────────────────
// 정렬 축 열 = 그 축의 세로 라인(행이 orderKey 순). 핀 행 이름을 드래그해 두 행 사이(between=새 slot)/행 위(tie=같은 slot)에 놓는다.
//  · droppable/over 에 의존 안 함(취약) — DndContext 는 droppable 없이도 onDragMove/End 발화, 포인터 좌표만으로 판정.
// 본체(RankSheetPanel)는 DndContext 에 여기 핸들러를 걸고, overlay(컨텍스트 안)·indicator(portal, 밖)를 제자리에 꽂는다.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DragOverlay, PointerSensor, useSensor, useSensors,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { axisLinesQuery } from "../../api/queries.js";
import { placePoint, unplacePoint, type RankPoint, type RankTarget } from "../../api/rank.js";
import { placedAxisName } from "../../lib/computedAxis.js";
import { pointKey, parsePointKey } from "../../lib/pointKey.js";
import { computeRowDrop, type RowGeom } from "./rankGeometry.js";
import type { SheetRow } from "./rankSheet.js";

const draggedPoint = (id: unknown): RankPoint | null =>
    typeof id === "string" && id.startsWith("chip:") ? parsePointKey(id.slice(5)) : null;
// 드롭 인디케이터(body portal, fixed) — between=열 위 가로선, tie=행 테두리 링. x0..x1 = 정렬 축 열 범위.
interface SheetDrop { target: RankTarget; tie: boolean; y: number; rowTop?: number; rowBottom?: number; x0: number; x1: number; }

export interface SheetDragPlacement {
    /** DndContext 에 그대로 거는 것들 — 본체가 컨텍스트를 소유한다(헤더 컨트롤 등도 그 안에 살아서). */
    sensors: ReturnType<typeof useSensors>;
    onDragStart: (ev: DragStartEvent) => void;
    onDragMove: (ev: DragMoveEvent) => void;
    onDragEnd: (ev: DragEndEvent) => void;
    onDragCancel: () => void;
    /** 정렬 축 헤더 th 등록(열 x 범위의 원천) — SheetHeaderRow 가 채운다. */
    sortAxisThRef: React.MutableRefObject<HTMLTableCellElement | null>;
    /** DragOverlay — DndContext **안**에 꽂을 것. */
    overlay: JSX.Element;
    /** 드롭 인디케이터(body portal) — DndContext **밖**에 꽂을 것. */
    indicator: JSX.Element | null;
    /** 배치 해제(셀 우클릭 메뉴) — 같은 뮤테이션·같은 캐시 키라 여기 산다. */
    unplace: (axisId: string, point: RankPoint) => void;
}

export function useSheetDragPlacement({ dragAxisId, mainRows, rowRefs, scrollRef, primaryDir, nameOf }: {
    /** 드롭 대상 축 — null 이면 드래그 배치 꺼짐(축 정렬이 아니거나 열이 순위 순서가 아닐 때). */
    dragAxisId: string | null;
    mainRows: readonly SheetRow[];
    /** 행 pk → tr(드롭 Y 판정) — 본체가 소유한다(선택 따라가기도 같은 맵을 본다). */
    rowRefs: React.RefObject<Map<string, HTMLTableRowElement>>;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    /** 1차 정렬 방향 — 드롭 판정(prev/next)이 본다. */
    primaryDir: 1 | -1;
    nameOf: (code: string) => string;
}): SheetDragPlacement {
    const qc = useQueryClient();
    const invLines = (): void => void qc.invalidateQueries({ queryKey: axisLinesQuery().queryKey });
    const placeMut = useMutation({
        mutationFn: (v: { axisId: string; point: RankPoint; target: RankTarget }) => placePoint(placedAxisName(v.axisId), v.point, v.target),
        onSuccess: invLines,
    });
    // 배치 해제(셀 우클릭 메뉴) — 같은 뮤테이션·같은 캐시 키.
    const unplaceMut = useMutation({
        mutationFn: (v: { axisId: string; point: RankPoint }) => unplacePoint(placedAxisName(v.axisId), v.point),
        onSuccess: invLines,
    });
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const sortAxisThRef = useRef<HTMLTableCellElement | null>(null);         // 정렬 축 헤더(열 x 범위)
    const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [dragName, setDragName] = useState<string | null>(null);
    const [drop, setDrop] = useState<SheetDrop | null>(null);

    // 드래그 기하 캐시 — 매 move 마다 행 전수 getBoundingClientRect(각각 강제 레이아웃)를 돌리면
    // 비용이 행 수에 비례해 드래그가 무거워진다. **시작 때 한 번** 재고, move 에선 스크롤 오프셋만
    // 보정한다(드래그 중 행 집합·정렬은 안 변한다 — 배치 확정은 드롭 뒤에나 온다).
    const dragGeom = useRef<{ x0: number; x1: number; colMidY: number; rows: RowGeom[]; scrollTop: number; scrollLeft: number } | null>(null);
    const captureDragGeom = (): typeof dragGeom.current => {
        if (!dragAxisId) return null;                       // 축으로 정렬 + 열이 순위 순서일 때만 세로 라인
        const th = sortAxisThRef.current;
        if (!th) return null;
        const cr = th.getBoundingClientRect();
        const rows: RowGeom[] = [];
        for (const row of mainRows) {
            const cell = row.cells[dragAxisId];
            if (!cell) continue;
            const tr = rowRefs.current?.get(pointKey(row));
            if (!tr) continue;
            const rr = tr.getBoundingClientRect();
            rows.push({ point: { stockCode: row.stockCode, date: row.date, time: row.time }, orderKey: cell.orderKey, top: rr.top, bottom: rr.bottom, centerY: rr.top + rr.height / 2 });
        }
        const el = scrollRef.current;
        return { x0: cr.left, x1: cr.right, colMidY: (cr.top + cr.bottom) / 2, rows, scrollTop: el?.scrollTop ?? 0, scrollLeft: el?.scrollLeft ?? 0 };
    };

    const computeSheetDrop = (clientX: number, clientY: number): SheetDrop | null => {
        const g = dragGeom.current;
        if (!g) return null;
        // 캐시는 시작 시점의 뷰포트 좌표 — 이후 스크롤한 만큼만 되돌려 현재 좌표로 옮긴다.
        // (헤더 th 는 세로 sticky 라 y 는 그대로, x 만 가로 스크롤을 따라간다.)
        const el = scrollRef.current;
        const dy = (el?.scrollTop ?? g.scrollTop) - g.scrollTop;
        const dx = (el?.scrollLeft ?? g.scrollLeft) - g.scrollLeft;
        const x0 = g.x0 - dx;
        const x1 = g.x1 - dx;
        if (clientX < x0 || clientX > x1) return null; // 정렬 축 열 위에서만
        // DOM 측정은 캐시가 끝냈다 — 판정 규칙(타이 ±px·타이그룹 합류·prev/next 방향)은 rankGeometry(순수, 테스트됨).
        const placed = dy === 0 ? g.rows : g.rows.map((r) => ({ ...r, top: r.top - dy, bottom: r.bottom - dy, centerY: r.centerY - dy }));
        return { ...computeRowDrop(placed, clientY, primaryDir, g.colMidY), x0, x1 };
    };

    const onDragStart = (ev: DragStartEvent): void => {
        const pe = ev.activatorEvent as PointerEvent;
        dragStart.current = { x: pe.clientX ?? 0, y: pe.clientY ?? 0 };
        const p = draggedPoint(ev.active.id);
        setDragName(p ? nameOf(p.stockCode) : null);
        dragGeom.current = p ? captureDragGeom() : null;
    };
    const onDragMove = (ev: DragMoveEvent): void => {
        if (!draggedPoint(ev.active.id)) { setDrop(null); return; }
        setDrop(computeSheetDrop(dragStart.current.x + ev.delta.x, dragStart.current.y + ev.delta.y));
    };
    const onDragEnd = (ev: DragEndEvent): void => {
        const point = draggedPoint(ev.active.id);
        if (point && dragAxisId) {
            const d = computeSheetDrop(dragStart.current.x + ev.delta.x, dragStart.current.y + ev.delta.y);
            if (d) placeMut.mutate({ axisId: dragAxisId, point, target: d.target });
        }
        dragGeom.current = null;
        setDrop(null); setDragName(null);
    };
    const onDragCancel = (): void => { dragGeom.current = null; setDrop(null); setDragName(null); };

    const overlay = (
        <DragOverlay dropAnimation={null}>
            {dragName && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4, background: "var(--bg-tertiary)", border: "1px solid var(--accent-primary)", boxShadow: "0 6px 18px rgba(0,0,0,0.28)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{dragName}</span>}
        </DragOverlay>
    );

    const indicator = drop ? createPortal(
        drop.tie && drop.rowTop != null && drop.rowBottom != null
            ? <div style={{ position: "fixed", left: drop.x0, top: drop.rowTop, width: drop.x1 - drop.x0, height: drop.rowBottom - drop.rowTop, border: "2px solid var(--accent-primary)", borderRadius: 4, pointerEvents: "none", zIndex: 70, boxSizing: "border-box" }} />
            : <div style={{ position: "fixed", left: drop.x0, top: drop.y - 1, width: drop.x1 - drop.x0, height: 2, background: "var(--accent-primary)", boxShadow: "0 0 0 1px var(--bg-primary)", pointerEvents: "none", zIndex: 70 }} />,
        document.body,
    ) : null;

    return {
        sensors, onDragStart, onDragMove, onDragEnd, onDragCancel,
        sortAxisThRef, overlay, indicator,
        unplace: (axisId, point) => unplaceMut.mutate({ axisId, point }),
    };
}
