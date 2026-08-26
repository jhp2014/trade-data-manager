// 시트 행 하나 — RankSheetPanel 의 renderRow 클로저를 컴포넌트로 추출한 것.
//
// 클로저 시절의 문제 둘:
//  · 매 렌더마다 CELLS(8종 셀 렌더러 레코드)를 **행마다 재생성** — 정의가 렌더 경로에 있어 비용이고,
//    무엇보다 셀 렌더 규칙이 688줄 패널 본문 한가운데 묻혀 있었다.
//  · React.memo 를 걸 단위가 없어 호버 한 번에 전 행이 리렌더됐다(2026-07-30 점검의 미해결 항목).
// 여기로 오면서 memo 단위가 생겼다 — 핸들러는 **행을 인자로 받는 안정 콜백**(패널이 useCallback 으로 고정),
// 배열 props(groups)는 라벨 문자열로 대신 비교한다(areEqual).
//
// 열을 붙이는 법은 그대로: CELLS 항목 하나 + sheetColumns 의 COL_META 한 줄.
import { memo, type CSSProperties, type ReactNode } from "react";
import { COL_META, colKey, type Col, type ColKind } from "./sheetColumns.js";
import { isComputedAxis } from "../../lib/computedAxis.js";
import { rowKey } from "../../lib/pointKey.js";
import type { SheetRow } from "./rankSheet.js";
import type { RankCell } from "../../lib/rankIndex.js";
import { PIN, heatOf, outcomeColor } from "../../styles/palette.js";
import { cellView, type CellMode, type ValuedCell } from "./sheetCell.js";

// 행 피치 두 종류 — **가상화기의 estimateSize 가 이 상수를 그대로 쓴다**(측정 안 함).
// 그래서 행/그룹 머리 둘 다 box-sizing:border-box 로 테두리까지 이 안에 넣는다 — 실제 높이가
// 상수와 1px 이라도 어긋나면 스크롤 아래로 갈수록 자리가 밀린다.
export const ROW_H = 30;
/** 그룹 머리 줄 높이. */
export const GROUP_H = 22;

/** 셀 우클릭 페이로드 — 그룹 나누기(컷) 메뉴. day 행은 time 이 없다. */
export interface CellCtxPayload {
    axisId: string;
    point: { stockCode: string; date: string; time?: string };
    rank: number;
    total: number;
    x: number;
    y: number;
}
export interface SheetRowHandlers {
    onNav: (row: SheetRow) => void;
    onTogglePin: (key: string) => void;
    onCellCtx: (p: CellCtxPayload) => void;
    /** 결과 셀 우클릭 — 손으로 적는 값이라 입력 입구가 표 안에 있어야 한다. */
    onOutcomeCtx: (p: { row: SheetRow; x: number; y: number }) => void;
}

export interface SheetRowViewProps {
    row: SheetRow;
    cols: readonly Col[];
    /** 열 배치(고정 left·마지막 고정 열·폭) — layoutColumns 결과를 그대로. */
    leftOf: ReadonlyMap<string, number>;
    lastFrozenKey: string | null;
    widthOf: (c: Col) => number;
    name: string;
    /** 셀 표기 — 숫자 · 순위 눈금 · 값 눈금. */
    mode: CellMode;
    /**
     * 계산 축이 이 타점에 대해 아는 값(축 id → 값 자리·표기). 판단 축은 키가 없다.
     * 패널이 축별로 한 벌 만들어 **참조를 고정**해 넘긴다(memo 가 얕은 비교로 재사용하도록).
     */
    valuedOf: (axisId: string, row: SheetRow) => ValuedCell | undefined;
    sortAxisId: string | null;
    focus: boolean;
    pinned: boolean;
    /** 필터 밖(흐리게 표시) — narrow/dim 판정은 패널이 끝냈다. */
    dim: boolean;
    inPinnedBlock?: boolean;
    isLastPinned?: boolean;
    /**
     * 가상 목록에서 이 행이 앉을 자리(총 높이 상자 안 y). 없으면 흐름 배치(머리 블록의 핀 행).
     * **스칼라다** — 자리 스타일 객체를 받으면 매 렌더 새 참조라 아래 memo 가 조용히 죽는다.
     */
    top?: number;
    h: SheetRowHandlers;
}

function SheetRowViewImpl({
    row, cols, leftOf, lastFrozenKey, widthOf, name, mode, valuedOf, sortAxisId,
    focus, pinned, dim, inPinnedBlock = false, isLastPinned = false, top, h,
}: SheetRowViewProps): JSX.Element {
    const key = rowKey(row);
    // 배경은 전부 CSS(.sheet-row, theme.css) — 호버는 React 상태가 아니라 :hover 다.
    // 행 배경/불투명 셀 배경(sticky 비침 방지)이 --row-bg/--cell-bg 변수 한 쌍으로 갈리고,
    // focus·pinned 는 data 속성으로 CSS 에 알린다(호버 한 번에 패널 전체가 두 번 리렌더되던 것을 없앴다).
    // 행 구분선 — **행 div 가 한 번** 긋는다(표 시절엔 셀마다 그었다: border-collapse:separate 라 그래야 했다).
    // 고정 블록 안에서만 마지막만(블록 통합), 그 외(본문 핀 포함)는 매 행.
    const rowBorder = inPinnedBlock ? (isLastPinned ? "2px solid var(--border-strong)" : "none") : "1px solid var(--border-subtle)";
    const point = { stockCode: row.stockCode, date: row.date, time: row.time };

    // 좌측 고정 열 — layoutColumns 가 계산한 오프셋을 그대로 left 에 꽂는다(2단 이상도 그대로 선다).
    // 불투명 배경(--cell-bg)은 필수: 고정 셀 밑으로 지나가는 셀이 비친다.
    const stick = (c: Col): CSSProperties => {
        const left = leftOf.get(colKey(c));
        const s: CSSProperties = {};
        if (left != null) { s.position = "sticky"; s.left = left; s.zIndex = 2; s.background = "var(--cell-bg)"; }
        if (colKey(c) === lastFrozenKey) s.borderRight = "2px solid var(--border-strong)";
        return s;
    };

    type CellRender = { body: ReactNode; style?: CSSProperties; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void; title?: string };
    const CELLS: Record<ColKind, (c: Col) => CellRender> = {
        name: () => ({
            style: { fontWeight: 600, whiteSpace: "nowrap", position: "relative", borderLeft: `3px solid ${focus ? "var(--accent-primary)" : "transparent"}` },
            body: (
                <>
                    {/* flex 셀 안이라 minWidth:0 이 없으면 min-content 로 부풀어 말줄임이 안 걸린다. */}
                    <span onClick={() => h.onNav(row)} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: focus ? "var(--accent-primary)" : undefined }}>{name}</span>
                    {/* 핀 손잡이 — 늘 렌더하고 노출은 CSS(.sheet-pin: 행 :hover 또는 핀 상태)가 정한다.
                        day 행엔 없다 — 핀(작업 대상)은 타점의 개념이다. */}
                    {row.time !== undefined && <button className="sheet-pin" data-pinned={pinned ? "" : undefined}
                        onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); h.onTogglePin(key); }} title={pinned ? "핀 해제(▼)" : "핀 고정(▲)"}
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, alignItems: "center", padding: "0 4px 0 8px", border: "none", cursor: "pointer", color: pinned ? PIN : "var(--text-secondary)", fontSize: 12, lineHeight: 1, background: "linear-gradient(90deg, transparent, var(--cell-bg) 40%)" }}>{pinned ? "▼" : "▲"}</button>}
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
            body: row.time?.slice(0, 5) ?? "—",
        }),
        axis: (c) => {
            const axisId = (c as { axisId: string }).axisId;
            const cell = row.cells[axisId];
            const frozen = leftOf.has(colKey(c));
            return {
                onClick: () => h.onNav(row),
                // 우클릭 메뉴는 축 종류에 따라 갈린다(패널의 ctx 렌더): 판단 축=밴드+컷+배치해제,
                // 계산 축=값 경계(타점 앵커). 계산 축에 배치·컷이 없는 건 꽂을 자리가 없어서지 읽기 전용이라서가 아니다.
                onContextMenu: cell ? (ev) => { ev.preventDefault(); h.onCellCtx({ axisId, point, rank: cell.rank, total: cell.total, x: ev.clientX, y: ev.clientY }); } : undefined,
                title: isComputedAxis(axisId) ? "계산 축(수식) — 우클릭 = 이 값 이상/이하 · 클릭 = 이동" : "우클릭 = 이상/이하 밴드 · 그룹 나누기 · 배치 해제 · 클릭 = 이동",
                style: { cursor: "pointer", background: frozen ? "var(--cell-bg)" : sortAxisId === axisId ? "var(--bg-secondary)" : "transparent" },
                body: <Cell cell={cell} valued={valuedOf(axisId, row)} mode={mode} prominent={focus} barWidth={widthOf(c) - 18} />,
            };
        },
        // 결과 = 손으로 적는 큐레이션 값(통계 아님). 우클릭으로 고친다 — 셀 하나에 입구가 있어야 표를 보다 바로 적는다.
        outcome: () => ({
            onContextMenu: (ev) => { ev.preventDefault(); h.onOutcomeCtx({ row, x: ev.clientX, y: ev.clientY }); },
            title: "우클릭 = 결과 입력",
            style: { cursor: "context-menu" },
            body: row.outcome
                ? <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span>
                : <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>,
        }),
        // day 행 전용 — 타점 수(분봉 작업 진도). 0 은 흐리게(아직 분봉 작업 전인 하루가 한눈에).
        points: () => ({
            onClick: () => h.onNav(row),
            title: "이 날 찍은 복기 타점 수",
            style: { cursor: "pointer" },
            body: (row.pointCount ?? 0) > 0
                ? <span className="tabular" style={{ fontWeight: 600 }}>{row.pointCount}</span>
                : <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>,
        }),
        // day 행 전용 — 당일 코멘트 유무. 셀은 **중립 표식**이다: 헤더 라벨("메모")과 같은 글자를 셀에도
        // 찍으면 헤더가 아래로 반복되는 것처럼 읽혀 열의 정체가 흐려진다(옛 "코"/"코").
        comment: () => ({
            onClick: () => h.onNav(row),
            title: "당일 코멘트 유무",
            style: { cursor: "pointer" },
            body: row.comment
                ? <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>●</span>
                : <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>,
        }),
    };

    // ⚠ 행 div 에 overflow 를 걸지 말 것 — 걸리는 순간 그게 새 스크롤 기준이 돼 좌측 고정 열의
    //   sticky 가 조용히 죽는다(같이 밀려난다). 말줄임은 **셀 자신**의 overflow:hidden 으로 한다.
    //   .claude/decisions.md "워크벤치 목록 렌더링" 참고.
    return (
        <div className="sheet-row" data-focus={focus ? "" : undefined} data-pinned={pinned ? "" : undefined}
            style={{
                display: "flex", width: "100%", height: ROW_H, boxSizing: "border-box",
                borderBottom: rowBorder, opacity: dim ? 0.38 : 1,
                ...(top !== undefined ? { position: "absolute" as const, top, left: 0 } : null),
            }}>
            {cols.map((c) => {
                const r = CELLS[c.key](c);
                return (
                    <div key={colKey(c)} onClick={r.onClick} onContextMenu={r.onContextMenu} title={r.title}
                        style={{
                            width: widthOf(c), flex: "0 0 auto", boxSizing: "border-box", minWidth: 0,
                            // 세로 가운데는 td 가 공짜로 주던 것(vertical-align:middle), 가로는 COL_META.justify —
                            // 헤더가 이미 쓰던 그 필드다(정렬 소스가 헤더/본문 두 벌이던 게 한 벌로 합쳐졌다).
                            display: "flex", alignItems: "center", justifyContent: COL_META[c.key].justify,
                            ...COL_META[c.key].td, ...r.style, ...stick(c),
                        }}>
                        {r.body}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * memo — 포커스·핀이 바뀌면 그 행(들)만 리렌더되게(호버는 CSS 라 React 를 아예 안 거친다).
 * 배열/함수 props 는 얕은 비교가 안 되므로: 핸들러 묶음(h)·레이아웃(leftOf·widthOf)·cols 는 패널이 참조를 고정한다.
 */
export const SheetRowView = memo(SheetRowViewImpl, (a, b) =>
    a.row === b.row && a.cols === b.cols && a.leftOf === b.leftOf && a.lastFrozenKey === b.lastFrozenKey &&
    a.widthOf === b.widthOf && a.name === b.name && a.mode === b.mode && a.valuedOf === b.valuedOf &&
    a.sortAxisId === b.sortAxisId && a.focus === b.focus &&
    a.pinned === b.pinned && a.dim === b.dim && a.top === b.top &&
    a.inPinnedBlock === b.inPinnedBlock && a.isLastPinned === b.isLastPinned && a.h === b.h,
);

// ── 순위 셀(숫자 `rank/total` 또는 위치 눈금 틱). 미배치 = 흐린 점. prominent(선택 행) = 불릿처럼 굵게.
function Cell({ cell, valued, mode, prominent, barWidth }: {
    cell: RankCell | null; valued?: ValuedCell; mode: CellMode; prominent?: boolean; barWidth?: number;
}): JSX.Element {
    if (!cell) return <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>;
    const v = cellView(cell, mode, valued);
    if (mode === "number") {
        return (
            <span title={v.title} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, whiteSpace: "nowrap" }}>
                {v.text}<span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 10 }}>{v.sub}</span>
            </span>
        );
    }
    // 눈금 틱: 얇은 선 + 세로 틱(색=위치 히트). 폭 = 넓어진 축 열 활용. 선택 행은 굵은 불릿으로 선명.
    const col = heatOf(v.frac);
    return (
        <span style={{ position: "relative", display: "inline-block", width: Math.max(36, barWidth ?? 40), height: 14, verticalAlign: "middle" }} title={v.title}>
            <span style={{ position: "absolute", left: 1, right: 1, top: "50%", height: prominent ? 2 : 1, background: prominent ? "var(--text-tertiary)" : "var(--border-strong)", transform: "translateY(-50%)", borderRadius: 1 }} />
            <span style={{ position: "absolute", top: "50%", left: `calc(3px + ${v.frac} * (100% - 6px))`, width: prominent ? 5 : 3, height: prominent ? 13 : 10, background: col, transform: "translate(-50%,-50%)", borderRadius: 2, boxShadow: prominent ? "0 0 0 1.5px var(--bg-primary)" : undefined }} />
        </span>
    );
}
