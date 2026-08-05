// 시트 행 하나 — RankSheetPanel 의 renderRow 클로저를 컴포넌트로 추출한 것.
//
// 클로저 시절의 문제 둘:
//  · 매 렌더마다 CELLS(8종 셀 렌더러 레코드)를 **행마다 재생성** — 정의가 렌더 경로에 있어 비용이고,
//    무엇보다 셀 렌더 규칙이 688줄 패널 본문 한가운데 묻혀 있었다.
//  · React.memo 를 걸 단위가 없어 호버 한 번에 전 행이 리렌더됐다(2026-07-30 점검의 미해결 항목).
// 여기로 오면서 memo 단위가 생겼다 — 핸들러는 **행을 인자로 받는 안정 콜백**(패널이 useCallback 으로 고정),
// 배열 props(tags)는 라벨 문자열로 대신 비교한다(areEqual).
//
// 열을 붙이는 법은 그대로: CELLS 항목 하나 + sheetColumns 의 COL_META 한 줄.
import { memo, type CSSProperties, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { COL_META, colKey, type Col, type ColKind } from "./sheetColumns.js";
import { isComputedAxis } from "../../lib/computedAxis.js";
import { pointKey } from "../../lib/pointKey.js";
import { TagChips } from "../../components/TagChips.js";
import type { SheetRow } from "./rankSheet.js";
import type { RankCell } from "../../lib/rankIndex.js";
import type { RankPoint } from "../../api/rank.js";
import type { Excursion } from "./pathStats.js";
import type { Tag } from "../../api/tags.js";
import { FAIL, PIN, STRONG, WEAK, heatOf } from "../../styles/palette.js";

export const ROW_H = 30; // 모든 행 고정 높이 → 핀 sticky top 오프셋을 정확히 계산.

function outcomeColor(v?: string): string {
    if (!v) return "var(--text-tertiary)";
    if (/성공|승|익절|win|good/i.test(v)) return STRONG;
    if (/실패|패|손절|loss|bad/i.test(v)) return FAIL;
    return "var(--text-secondary)";
}

/** 셀 우클릭 페이로드 — 판단 축=slot 밴드·컷·배치해제 / 계산 축=값 경계 메뉴(패널이 axisId 로 가른다). */
export interface CellCtxPayload {
    axisId: string;
    slotId: string;
    point: RankPoint;
    rank: number;
    total: number;
    x: number;
    y: number;
}
export interface TagCtxPayload {
    point: RankPoint;
    label: string;
    x: number;
    y: number;
}

export interface SheetRowHandlers {
    onNav: (row: SheetRow) => void;
    onHover: (key: string | null) => void;
    onTogglePin: (key: string) => void;
    onCellCtx: (p: CellCtxPayload) => void;
    onTagCtx: (p: TagCtxPayload) => void;
    /** tbody 행만 등록(핀 블록 복사본 제외) — 드래그 배치의 드롭 Y 판정용. */
    registerRef: (key: string, el: HTMLTableRowElement | null) => void;
}

export interface SheetRowViewProps {
    row: SheetRow;
    cols: readonly Col[];
    /** 열 배치(고정 left·마지막 고정 열·폭) — layoutColumns 결과를 그대로. */
    leftOf: ReadonlyMap<string, number>;
    lastFrozenKey: string | null;
    widthOf: (c: Col) => number;
    name: string;
    tags: readonly Tag[];
    tagLabel: string;
    axisCount: number;
    posBar: boolean;
    sortAxisId: string | null;
    focus: boolean;
    hover: boolean;
    pinned: boolean;
    /** 필터 밖(흐리게 표시) — narrow/dim 판정은 패널이 끝냈다. */
    dim: boolean;
    exc?: Excursion;
    inPinnedBlock?: boolean;
    isLastPinned?: boolean;
    h: SheetRowHandlers;
}

function SheetRowViewImpl({
    row, cols, leftOf, lastFrozenKey, widthOf, name, tags, tagLabel, axisCount, posBar, sortAxisId,
    focus, hover, pinned, dim, exc, inPinnedBlock = false, isLastPinned = false, h,
}: SheetRowViewProps): JSX.Element {
    const key = pointKey(row);
    // 배경 — 핀 행도 일반 행처럼 배경 없음(불투명 bg-primary로 sticky 비침만 방지). 좌측 바·하단 구분선으로 구분.
    const rowBg = focus ? "var(--accent-soft)" : hover ? "var(--bg-secondary)" : pinned ? "var(--bg-primary)" : "transparent";
    const cellBgOpaque = focus ? "var(--accent-soft)" : hover ? "var(--bg-secondary)" : "var(--bg-primary)";
    // 행 구분선(셀에, separate 모드) — 고정 블록 안에서만 마지막만(블록 통합), 그 외(tbody 핀 포함)는 매 행.
    const rowBorder = inPinnedBlock ? (isLastPinned ? "2px solid var(--border-strong)" : "none") : "1px solid var(--border-subtle)";
    const point: RankPoint = { stockCode: row.stockCode, date: row.date, time: row.time };

    const stick = (c: Col): CSSProperties => {
        const left = leftOf.get(colKey(c));
        const s: CSSProperties = { borderBottom: rowBorder };
        if (left != null) { s.position = "sticky"; s.left = left; s.zIndex = 2; s.background = cellBgOpaque; }
        if (colKey(c) === lastFrozenKey) s.borderRight = "2px solid var(--border-strong)";
        return s;
    };

    type CellRender = { body: ReactNode; style?: CSSProperties; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void; title?: string };
    // MFE/MAE 3열은 부호·색만 다른 같은 셀 — 경로 통계(exc)가 없으면 "—".
    const excursionCell = (field: "mfe" | "maePre" | "maePost"): CellRender => {
        const v = exc ? exc[field] : null;
        return { style: { color: field === "mfe" ? STRONG : WEAK }, body: v == null ? "—" : (field === "mfe" ? "+" : "") + v.toFixed(1) };
    };
    const CELLS: Record<ColKind, (c: Col) => CellRender> = {
        name: () => ({
            style: { fontWeight: 600, whiteSpace: "nowrap", position: "relative", borderLeft: `3px solid ${focus ? "var(--accent-primary)" : "transparent"}` },
            body: (
                <>
                    {inPinnedBlock
                        ? <PinnedDragName pkStr={key} name={name} focus={focus} onNav={() => h.onNav(row)} />
                        : <span onClick={() => h.onNav(row)} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: focus ? "var(--accent-primary)" : undefined }}>{name}</span>}
                    {(hover || pinned) && (
                        <button onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); h.onTogglePin(key); }} title={pinned ? "핀 해제(▼)" : "핀 고정(▲)"}
                            style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", padding: "0 4px 0 8px", border: "none", cursor: "pointer", color: pinned ? PIN : "var(--text-secondary)", fontSize: 12, lineHeight: 1, background: `linear-gradient(90deg, transparent, ${cellBgOpaque} 40%)` }}>{pinned ? "▼" : "▲"}</button>
                    )}
                </>
            ),
        }),
        date: () => ({
            onClick: () => h.onNav(row),
            style: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "center", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)" },
            body: row.date.slice(2).replace(/-/g, "."),
        }),
        time: () => ({
            onClick: () => h.onNav(row),
            style: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "center", cursor: "pointer", fontWeight: 600, color: "var(--accent-primary)" },
            body: row.time.slice(0, 5),
        }),
        axis: (c) => {
            const axisId = (c as { axisId: string }).axisId;
            const cell = row.cells[axisId];
            const frozen = leftOf.has(colKey(c));
            return {
                onClick: () => h.onNav(row),
                // 우클릭 메뉴는 축 종류에 따라 갈린다(패널의 ctx 렌더): 판단 축=slot 밴드+컷+배치해제,
                // 계산 축=값 경계(타점 앵커). 계산 축에 배치·컷이 없는 건 slot 이 없어서지 읽기 전용이라서가 아니다.
                onContextMenu: cell ? (ev) => { ev.preventDefault(); h.onCellCtx({ axisId, slotId: cell.slotId, point, rank: cell.rank, total: cell.total, x: ev.clientX, y: ev.clientY }); } : undefined,
                title: isComputedAxis(axisId) ? "계산 축(수식) — 우클릭 = 이 값 이상/이하 · 클릭 = 이동" : "우클릭 = 이상/이하 밴드 · 그룹 나누기 · 배치 해제 · 클릭 = 이동",
                style: { cursor: "pointer", background: frozen ? cellBgOpaque : sortAxisId === axisId ? "var(--bg-secondary)" : "transparent" },
                body: <Cell cell={cell} posBar={posBar} prominent={focus} barWidth={widthOf(c) - 18} />,
            };
        },
        // 태그 — 폭이 모자라면 **그냥 잘린다**(wrap·스크롤 없음). 더 보고 싶으면 열 폭을 늘리는 게 이 표의 규칙.
        //   좁은 열이라 그룹 prefix 는 뗀다(색이 이미 그룹을 말한다). 전체 이름은 셀 툴팁에.
        tags: () => ({
            onClick: () => h.onNav(row),
            onContextMenu: (ev) => {
                ev.preventDefault();
                h.onTagCtx({ point, label: `${name} · ${row.date.slice(5)} ${row.time.slice(0, 5)}`, x: ev.clientX, y: ev.clientY });
            },
            style: { cursor: "pointer", overflow: "hidden" },
            title: `${tagLabel || "태그 없음"} — 우클릭 = 태그 입력`,
            body: <TagChips tags={[...tags]} short style={{ justifyContent: "center" }} />,
        }),
        coverage: () => ({
            style: { color: row.coverage === axisCount ? STRONG : "var(--text-secondary)" },
            body: `${row.coverage}/${axisCount}`,
        }),
        outcome: () => ({
            body: row.outcome ? <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span> : null,
        }),
        mfe: () => excursionCell("mfe"),
        maePre: () => excursionCell("maePre"),
        maePost: () => excursionCell("maePost"),
    };

    return (
        <tr onMouseEnter={() => h.onHover(key)} onMouseLeave={() => h.onHover(null)}
            ref={inPinnedBlock ? undefined : (el) => h.registerRef(key, el)}
            style={{ background: rowBg, opacity: dim ? 0.38 : 1, height: ROW_H }}>
            {cols.map((c) => {
                const r = CELLS[c.key](c);
                return (
                    <td key={colKey(c)} onClick={r.onClick} onContextMenu={r.onContextMenu} title={r.title}
                        style={{ ...COL_META[c.key].td, ...r.style, ...stick(c) }}>
                        {r.body}
                    </td>
                );
            })}
        </tr>
    );
}

/**
 * memo — 호버·포커스가 바뀌면 그 행(들)만 리렌더되게. 배열/함수 props 는 얕은 비교가 안 되므로:
 * 핸들러 묶음(h)·레이아웃(leftOf·widthOf)·cols 는 패널이 참조를 고정하고, tags 는 tagLabel 문자열로 대신 비교.
 */
export const SheetRowView = memo(SheetRowViewImpl, (a, b) =>
    a.row === b.row && a.cols === b.cols && a.leftOf === b.leftOf && a.lastFrozenKey === b.lastFrozenKey &&
    a.widthOf === b.widthOf && a.name === b.name && a.tagLabel === b.tagLabel && a.axisCount === b.axisCount &&
    a.posBar === b.posBar && a.sortAxisId === b.sortAxisId && a.focus === b.focus && a.hover === b.hover &&
    a.pinned === b.pinned && a.dim === b.dim && a.exc === b.exc &&
    a.inPinnedBlock === b.inPinnedBlock && a.isLastPinned === b.isLastPinned && a.h === b.h,
);

// 핀(고정) 행 이름 = 드래그 소스(chip:{pk}). 정렬 축 열에 드롭해 배치. 그냥 클릭=이동(dnd distance 4 로 클릭/드래그 자동 구분).
function PinnedDragName({ pkStr, name, focus, onNav }: { pkStr: string; name: string; focus: boolean; onNav: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${pkStr}` });
    return (
        <span ref={setNodeRef} {...listeners} {...attributes} onClick={onNav} title={`${name} — 드래그해 정렬 축에 배치 · 클릭=이동`}
            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "grab", touchAction: "none", opacity: isDragging ? 0.4 : 1, color: focus ? "var(--accent-primary)" : undefined }}>{name}</span>
    );
}

// ── 순위 셀(숫자 `rank/total` 또는 위치 눈금 틱). 미배치 = 흐린 점. prominent(선택 행) = 불릿처럼 굵게.
function Cell({ cell, posBar, prominent, barWidth }: { cell: RankCell | null; posBar: boolean; prominent?: boolean; barWidth?: number }): JSX.Element {
    if (!cell) return <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>;
    if (!posBar) return <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{cell.rank}<span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/{cell.total}</span></span>;
    // 눈금 틱: 얇은 선 + 세로 틱(색=위치 히트). 폭 = 넓어진 축 열 활용. 선택 행은 굵은 불릿으로 선명.
    const col = heatOf(cell.frac);
    return (
        <span style={{ position: "relative", display: "inline-block", width: Math.max(36, barWidth ?? 40), height: 14, verticalAlign: "middle" }} title={`${cell.rank}/${cell.total}`}>
            <span style={{ position: "absolute", left: 1, right: 1, top: "50%", height: prominent ? 2 : 1, background: prominent ? "var(--text-tertiary)" : "var(--border-strong)", transform: "translateY(-50%)", borderRadius: 1 }} />
            <span style={{ position: "absolute", top: "50%", left: `calc(3px + ${cell.frac} * (100% - 6px))`, width: prominent ? 5 : 3, height: prominent ? 13 : 10, background: col, transform: "translate(-50%,-50%)", borderRadius: 2, boxShadow: prominent ? "0 0 0 1.5px var(--bg-primary)" : undefined }} />
        </span>
    );
}
