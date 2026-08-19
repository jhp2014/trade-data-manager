// 시트의 팝업 네 벌(셀 우클릭 · 열 이름 우클릭 · 축 만들기 · 결과 입력)의 **상태와 배선**.
// 시각 조각(AddAxisMenu·HeaderMenu·OutcomeMenu)은 SheetMenus 가 이미 든다 — 여기는 "언제 무엇이
// 열리고, 누르면 어느 손잡이가 도나"만 있다. 본체는 opener 만 받아 행·헤더·컨트롤에 나눠 꽂는다.
import { useState } from "react";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import { isComputedAxis, type AxisRef } from "../../lib/computedAxis.js";
import { pointKey } from "../../lib/pointKey.js";
import type { RankPoint } from "../../api/rank.js";
import { AddAxisMenu, HeaderMenu, OutcomeMenu } from "./SheetMenus.js";
import type { CellCtxPayload } from "./SheetRowView.js";
import type { HdrCtxPayload } from "./SheetHeaderRow.js";
import type { SheetRow } from "./rankSheet.js";
import type { SheetColumns } from "./useSheetColumns.js";
import type { AxisAdmin } from "./useAxisAdmin.js";
import type { SortKey } from "./sheetSort.js";

/** 팝업 상태 한 벌 — 본체가 소유를 넘기고 opener 만 쓴다(닫기는 각 메뉴가 스스로). */
export interface SheetMenuState {
    ctx: CellCtxPayload | null;
    hdrCtx: HdrCtxPayload | null;
    addAxis: { x: number; y: number } | null;
    outcomeCtx: { row: SheetRow; x: number; y: number } | null;
    // ── 우클릭 이상/이하 경계(드래그 선택 보완) — 어느 축 셀에서든 정밀 단일 경계. 배치 해제도 같은 메뉴에서(셀 = 타점×축 하나).
    openCellCtx: (v: CellCtxPayload) => void;
    // ── 열 이름 우클릭 = 고정/숨김 + 정렬 체인에서 빼기 메뉴.
    openHdrCtx: (v: HdrCtxPayload) => void;
    openAddAxis: (at: { x: number; y: number }) => void;
    openOutcomeCtx: (v: { row: SheetRow; x: number; y: number }) => void;
    close: {
        ctx: () => void; hdrCtx: () => void; addAxis: () => void; outcomeCtx: () => void;
    };
}

export function useSheetMenus(): SheetMenuState {
    const [ctx, setCtx] = useState<CellCtxPayload | null>(null);
    const [hdrCtx, setHdrCtx] = useState<HdrCtxPayload | null>(null);
    const [addAxis, setAddAxis] = useState<{ x: number; y: number } | null>(null);
    const [outcomeCtx, setOutcomeCtx] = useState<{ row: SheetRow; x: number; y: number } | null>(null);
    return {
        ctx, hdrCtx, addAxis, outcomeCtx,
        openCellCtx: setCtx, openHdrCtx: setHdrCtx, openAddAxis: setAddAxis, openOutcomeCtx: setOutcomeCtx,
        close: {
            ctx: () => setCtx(null), hdrCtx: () => setHdrCtx(null),
            addAxis: () => setAddAxis(null), outcomeCtx: () => setOutcomeCtx(null),
        },
    };
}

export function SheetMenusHost({ m, axes, cols, sortAxisId, sortLen, dropSortKey, unplace, admin }: {
    m: SheetMenuState;
    axes: readonly AxisRef[];
    /** 컷·고정·숨김 손잡이 — 열 구성 훅(useSheetColumns)의 것을 그대로 쓴다. */
    cols: SheetColumns;
    sortAxisId: string | null;
    /** 정렬 체인 길이 — 열 메뉴의 "n차 정렬에서 빼기"는 2단 이상일 때만 뜬다. */
    sortLen: number;
    dropSortKey: (k: SortKey) => void;
    /** 배치 해제 — 드래그 배치 훅(useSheetDragPlacement)과 같은 뮤테이션. */
    unplace: (axisId: string, point: RankPoint) => void;
    admin: AxisAdmin;
}): JSX.Element {
    const { ctx, hdrCtx, addAxis, outcomeCtx } = m;
    return (
        <>
            {/* 셀 우클릭 — 배치 편집만 남았다(밴드·값경계는 필터 패널로 이사). 계산 축은 배치가 없어 메뉴도 없다. */}
            {ctx && !isComputedAxis(ctx.axisId) && (() => {
                const ax = axes.find((a) => a.key === ctx.axisId);
                if (!ax) return null;
                const cutOn = (cols.cuts[`ax:${ctx.axisId}`] ?? []).includes(pointKey(ctx.point));
                const cutEnabled = sortAxisId === ctx.axisId; // 1차 정렬 축에서만 — 안 보이는 줄엔 선을 못 긋는다
                return (
                    <AnchoredPopover anchor={ctx} onClose={m.close.ctx} minWidth={180} padding={0} placement="beside" offset={6}>
                        <MenuLabel>{ax.name} · {ctx.rank}/{ctx.total}위</MenuLabel>
                        {cutEnabled && (
                            <MenuItem onClick={() => { cols.toggleCut(ctx.axisId, pointKey(ctx.point)); m.close.ctx(); }}>
                                {cutOn ? "그룹 나누기 해제" : "여기서 그룹 나누기"}
                            </MenuItem>
                        )}
                        <MenuItem onClick={() => { unplace(ctx.axisId, ctx.point); m.close.ctx(); }}>
                            이 축에서 배치 해제
                        </MenuItem>
                    </AnchoredPopover>
                );
            })()}

            {addAxis && (
                <AddAxisMenu anchor={addAxis} onCreate={(name, scope) => { admin.createAxis(name, scope); m.close.addAxis(); }} onClose={m.close.addAxis} />
            )}

            {outcomeCtx && (
                <OutcomeMenu anchor={outcomeCtx} current={outcomeCtx.row.outcome} choices={admin.outcomeChoices}
                    onPick={(outcome) => { admin.saveOutcome(outcomeCtx.row, outcome); m.close.outcomeCtx(); }}
                    onClose={m.close.outcomeCtx} />
            )}

            {hdrCtx && (
                <HeaderMenu anchor={hdrCtx} label={hdrCtx.label} frozen={hdrCtx.frozen} canHide={hdrCtx.canHide} canFreeze={hdrCtx.key !== "name"}
                    sortStep={sortLen > 1 ? hdrCtx.step : 0}
                    onToggleFreeze={() => { cols.toggleFrozen(hdrCtx.key); m.close.hdrCtx(); }}
                    onHide={() => { cols.toggleHidden(hdrCtx.key); m.close.hdrCtx(); }}
                    onDropSort={() => { dropSortKey(hdrCtx.sortKey); m.close.hdrCtx(); }}
                    axis={hdrCtx.axisId === undefined ? undefined : {
                        onRename: () => {
                            const name = prompt("축 이름", hdrCtx.label)?.trim();
                            if (name && name !== hdrCtx.label) admin.renameAxis(hdrCtx.axisId!, name);
                            m.close.hdrCtx();
                        },
                        onDelete: () => {
                            if (confirm(`축 "${hdrCtx.label}" 을 삭제할까요? 배치도 함께 제거됩니다.`)) admin.deleteAxis(hdrCtx.axisId!);
                            m.close.hdrCtx();
                        },
                    }}
                    onClose={m.close.hdrCtx} />
            )}
        </>
    );
}
