// 시트의 열 헤더 한 줄 — 정렬(클릭/Shift+클릭) · 열 드래그 재정렬 두 종류 · 폭 손잡이 · 우클릭 메뉴 열기.
// 그리기만 한다: 정렬 상태·열 구성은 본체가 주고, 우클릭은 payload 를 만들어 올려보낸다(메뉴는 SheetMenusHost 가).
import type { CSSProperties } from "react";
import { COL_META, colKey, colLabel, type Col } from "./sheetColumns.js";
import { sortKeyOf, sortStepNo, type SortChain, type SortKey } from "./sheetSort.js";
import { ResizeHandle } from "./SheetMenus.js";
import { ROW_H } from "./SheetRowView.js";
import type { SheetColumns } from "./useSheetColumns.js";

// 열 헤더 드래그의 두 종류 — 미디어타입으로 갈라 서로의 드롭을 안 받는다(고정 그룹 재정렬 vs 축 서열 변경).
const AXIS_DND = "application/x-rank-axis";
const COL_DND = "application/x-rank-col";

/** 열 이름 우클릭의 payload — 메뉴(SheetMenusHost)가 소비한다. */
export interface HdrCtxPayload {
    key: string; label: string; canHide: boolean; frozen: boolean;
    sortKey: SortKey; step: number; x: number; y: number;
}

export function SheetHeaderRow({ displayCols, cols, sort, reorderAxis, onSort, onHeaderCtx }: {
    displayCols: Col[];
    cols: SheetColumns;
    sort: SortChain;
    /** 비고정 축 열의 서열 변경(store rankAxisOrder — 시트 전용. 집합 편성 보드는 제 순서를 따로 든다). */
    reorderAxis: (draggedId: string, targetId: string) => void;
    /** 평클릭=리셋 · Shift+클릭=단 추가 — 규칙은 본체(sheetSort)가 든다. */
    onSort: (key: SortKey, shift: boolean) => void;
    onHeaderCtx: (v: HdrCtxPayload) => void;
}): JSX.Element {
    const { leftOf, lastFrozenKey, widthOf, frozenSet, flashCol } = cols;
    return (
        <tr style={{ height: ROW_H }}>
            {displayCols.map((c) => {
                const sk = sortKeyOf(c);
                const step = sortStepNo(sort, sk); // 0=미정렬, 1=1차, 2…=2차 이하
                const active = step > 0;
                const left = leftOf.get(colKey(c));
                const justify = COL_META[c.key].justify;
                // 드래그 재정렬 두 종류 — **고정 여부로 갈린다**(순서 소스가 둘이기 때문).
                //   고정 열  = 시트 전용 자리 → frozenCols 배열만 재배치(배치 보드 무관)
                //   비고정 축 = 축 서열 그 자체 → reorderAxis(store rankAxisOrder)
                // 종목 열은 언제나 맨 앞 붙박이라 어느 쪽도 아니다.
                const frozenHere = c.key !== "name" && frozenSet.has(colKey(c));
                const dnd = frozenHere ? {
                    draggable: true,
                    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(COL_DND, colKey(c)); e.dataTransfer.effectAllowed = "move"; },
                    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(COL_DND)) e.preventDefault(); },
                    onDrop: (e: React.DragEvent) => { const k = e.dataTransfer.getData(COL_DND); if (k) cols.reorderFrozen(k, colKey(c)); },
                } : c.key === "axis" ? {
                    draggable: true,
                    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(AXIS_DND, (c as { axisId: string }).axisId); e.dataTransfer.effectAllowed = "move"; },
                    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(AXIS_DND)) e.preventDefault(); },
                    onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData(AXIS_DND); if (id) reorderAxis(id, (c as { axisId: string }).axisId); },
                } : {};
                return (
                    <th key={colKey(c)} {...dnd} title={`${colLabel(c)} — 클릭=이 열로 정렬 · Shift+클릭=정렬 단 추가`}
                        ref={(el) => {
                            cols.registerTh(colKey(c), el);
                        }}
                        onClick={(e) => onSort(sk, e.shiftKey)}
                        onContextMenu={(e) => { e.preventDefault(); onHeaderCtx({ key: colKey(c), label: colLabel(c), canHide: c.key !== "name", frozen: c.key === "name" || frozenSet.has(colKey(c)), sortKey: sk, step, x: e.clientX, y: e.clientY }); }}
                        style={{ ...thBase, position: "relative", cursor: "pointer", color: step === 1 ? "var(--accent-primary)" : active ? "var(--text-secondary)" : "var(--text-tertiary)", ...(colKey(c) === lastFrozenKey ? { borderRight: "2px solid var(--border-strong)" } : {}), ...(left != null ? { position: "sticky", left, zIndex: 6, background: "var(--bg-secondary)" } : {}), ...(flashCol === colKey(c) ? { background: "var(--accent-soft)", boxShadow: "inset 0 -2px 0 var(--accent-primary)" } : {}) }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 2, minWidth: 0 }}>
                            {active && <span style={{ flexShrink: 0 }}>{sort[step - 1].dir === 1 ? "▲" : "▼"}</span>}
                            {/* 단 번호는 체인이 2단 이상일 때만 — 기본 화면(1단)은 지금과 똑같이 보인다. */}
                            {active && sort.length > 1 && <span style={{ flexShrink: 0, fontSize: 8.5, opacity: 0.8, marginRight: 1 }}>{step}</span>}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colLabel(c)}</span>
                        </span>
                        <ResizeHandle width={widthOf(c)} onResize={(w) => cols.previewWidth(colKey(c), w)} onCommit={(w) => cols.commitWidth(colKey(c), w)} />
                    </th>
                );
            })}
        </tr>
    );
}

// userSelect none — Shift+클릭(정렬 단 추가)이 헤더 글자를 범위 선택해 파랗게 물들이는 걸 막는다.
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "6px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", userSelect: "none" };
