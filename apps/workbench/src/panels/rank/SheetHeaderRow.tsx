// 시트의 열 헤더 한 줄 — 정렬(클릭/Shift+클릭) · 열 드래그 재정렬 · 폭 손잡이 · 우클릭 메뉴 열기.
// 그리기만 한다: 정렬 상태·열 구성은 본체가 주고, 우클릭은 payload 를 만들어 올려보낸다(메뉴는 SheetMenusHost 가).
import type { CSSProperties } from "react";
import { colHelp, colJustify, colKey, colLabel, colPart, type Col } from "./sheetColumns.js";
import { sortKeyOf, sortStepNo, type SortChain, type SortKey } from "./sheetSort.js";
import { ResizeHandle } from "./SheetMenus.js";
import { ROW_H } from "./SheetRowView.js";
import type { SheetColumns } from "./useSheetColumns.js";

/** 열 드래그의 미디어타입 — **집합 편성 보드의 레일 드래그**(`x-filter-axis`)와 갈라 둔다:
 *  같으면 시트 열을 보드에 떨어뜨렸을 때 엉뚱한 순서가 바뀐다(순서는 화면마다 별개 저장물). */
const COL_DND = "application/x-rank-col";

/** 열 이름 우클릭의 payload — 메뉴(SheetMenusHost)가 소비한다. */
export interface HdrCtxPayload {
    key: string; label: string; canHide: boolean; frozen: boolean;
    sortKey: SortKey; step: number; x: number; y: number;
}

export function SheetHeaderRow({ displayCols, cols, sort, onSort, onHeaderCtx }: {
    displayCols: Col[];
    cols: SheetColumns;
    sort: SortChain;
    /** 평클릭=리셋 · Shift+클릭=단 추가 — 규칙은 본체(sheetSort)가 든다. */
    onSort: (key: SortKey, shift: boolean) => void;
    onHeaderCtx: (v: HdrCtxPayload) => void;
}): JSX.Element {
    const { leftOf, lastFrozenKey, widthOf, frozenSet, flashCol } = cols;
    return (
        <div style={{ display: "flex", width: "100%", height: ROW_H, boxSizing: "border-box" }}>
            {displayCols.map((c) => {
                const sk = sortKeyOf(c);
                const step = sortStepNo(sort, sk); // 0=미정렬, 1=1차, 2…=2차 이하
                const active = step > 0;
                const left = leftOf.get(colKey(c));
                const justify = colJustify(c);
                const help = colHelp(c); // 결과 열만 설명 한 줄이 붙는다(축·기본 열은 라벨이 곧 설명)
                // 드래그 재정렬 — **종류·고정 여부를 안 가린다**(시트의 순서 저장물은 하나다).
                // 종목 열만 예외: 언제나 맨 앞 붙박이라 잡이도 드롭 자리도 없다.
                const dnd = c.key === "name" ? {} : {
                    draggable: true,
                    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(COL_DND, colKey(c)); e.dataTransfer.effectAllowed = "move"; },
                    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(COL_DND)) e.preventDefault(); },
                    onDrop: (e: React.DragEvent) => { const k = e.dataTransfer.getData(COL_DND); if (k) cols.reorderCol(k, colKey(c)); },
                };
                return (
                    <div key={colKey(c)} {...dnd} title={`${colLabel(c)} — ${help ? `${help}\n` : ""}클릭=이 열로 정렬 · Shift+클릭=정렬 단 추가`}
                        ref={(el) => {
                            cols.registerTh(colKey(c), el);
                        }}
                        onClick={(e) => onSort(sk, e.shiftKey)}
                        onContextMenu={(e) => { e.preventDefault(); onHeaderCtx({ key: colKey(c), label: colLabel(c), canHide: c.key !== "name", frozen: c.key === "name" || frozenSet.has(colKey(c)), sortKey: sk, step, x: e.clientX, y: e.clientY }); }}
                        style={{ ...thBase, width: widthOf(c), flex: "0 0 auto", boxSizing: "border-box", minWidth: 0, display: "flex", alignItems: "center", position: "relative", cursor: "pointer", color: step === 1 ? "var(--accent-primary)" : active ? "var(--text-secondary)" : "var(--text-tertiary)", ...(colKey(c) === lastFrozenKey ? { borderRight: "2px solid var(--border-strong)" } : {}), ...(left != null ? { position: "sticky", left, zIndex: 6, background: "var(--bg-secondary)" } : {}), ...(flashCol === colKey(c) ? { background: "var(--accent-soft)", boxShadow: "inset 0 -2px 0 var(--accent-primary)" } : {}) }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 2, flex: 1, minWidth: 0 }}>
                            {active && <span style={{ flexShrink: 0 }}>{sort[step - 1].dir === 1 ? "▲" : "▼"}</span>}
                            {/* 단 번호는 체인이 2단 이상일 때만 — 기본 화면(1단)은 지금과 똑같이 보인다. */}
                            {active && sort.length > 1 && <span style={{ flexShrink: 0, fontSize: 8.5, opacity: 0.8, marginRight: 1 }}>{step}</span>}
                            {/* 부품 열 색점 — 라벨의 부품 이름과 함께 "어느 정의의 값인가"를 말한다(SetManager 색점과 같은 출처). */}
                            {colPart(c) && <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: colPart(c)!.color }} />}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colLabel(c)}</span>
                        </span>
                        <ResizeHandle width={widthOf(c)} onResize={(w) => cols.previewWidth(colKey(c), w)} onCommit={(w) => cols.commitWidth(colKey(c), w)} />
                    </div>
                );
            })}
        </div>
    );
}

// userSelect none — Shift+클릭(정렬 단 추가)이 헤더 글자를 범위 선택해 파랗게 물들이는 걸 막는다.
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "6px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", userSelect: "none" };
