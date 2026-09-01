// 시트의 팝업 두 벌(셀 우클릭 · 열 이름 우클릭)의 **상태와 배선**.
// 시각 조각(HeaderMenu)은 SheetMenus 가 이미 든다 — 여기는 "언제 무엇이
// 열리고, 누르면 어느 손잡이가 도나"만 있다. 본체는 opener 만 받아 행·헤더·컨트롤에 나눠 꽂는다.
import { useState } from "react";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import type { AxisRef } from "../../lib/computedAxis.js";
import { chartKey, rowKey, rowKeyToChartKey } from "../../lib/pointKey.js";
import { HeaderMenu } from "./SheetMenus.js";
import type { CellCtxPayload } from "./SheetRowView.js";
import type { HdrCtxPayload } from "./SheetHeaderRow.js";
import type { SheetColumns } from "./useSheetColumns.js";
import type { SortKey } from "./sheetSort.js";

/** 팝업 상태 한 벌 — 본체가 소유를 넘기고 opener 만 쓴다(닫기는 각 메뉴가 스스로). */
export interface SheetMenuState {
    ctx: CellCtxPayload | null;
    hdrCtx: HdrCtxPayload | null;
    // ── 셀 우클릭 = 그룹 나누기(컷) — 1차 정렬 축에서만(안 보이는 줄엔 선을 못 긋는다).
    openCellCtx: (v: CellCtxPayload) => void;
    // ── 열 이름 우클릭 = 고정/숨김 + 정렬 체인에서 빼기 메뉴.
    openHdrCtx: (v: HdrCtxPayload) => void;
    close: {
        ctx: () => void; hdrCtx: () => void;
    };
}

export function useSheetMenus(): SheetMenuState {
    const [ctx, setCtx] = useState<CellCtxPayload | null>(null);
    const [hdrCtx, setHdrCtx] = useState<HdrCtxPayload | null>(null);
    return {
        ctx, hdrCtx,
        openCellCtx: setCtx, openHdrCtx: setHdrCtx,
        close: {
            ctx: () => setCtx(null), hdrCtx: () => setHdrCtx(null),
        },
    };
}

export function SheetMenusHost({ m, axes, cols, sortAxisId, sortLen, dropSortKey }: {
    m: SheetMenuState;
    axes: readonly AxisRef[];
    /** 컷·고정·숨김 손잡이 — 열 구성 훅(useSheetColumns)의 것을 그대로 쓴다. */
    cols: SheetColumns;
    sortAxisId: string | null;
    /** 정렬 체인 길이 — 열 메뉴의 "n차 정렬에서 빼기"는 2단 이상일 때만 뜬다. */
    sortLen: number;
    dropSortKey: (k: SortKey) => void;
}): JSX.Element {
    const { ctx, hdrCtx } = m;
    return (
        <>
            {/* 셀 우클릭 — 그룹 나누기(컷)만 남았다(배치 해제는 판단축과 함께, 밴드·값경계는 필터 패널로). */}
            {ctx && (() => {
                const ax = axes.find((a) => a.key === ctx.axisId);
                if (!ax) return null;
                // 컷 키 = 그 축의 **행 키** — day 축 줄의 자리는 차트(시각 없음)라 차트 키로 저장해야
                // orderKeyByPoint(행 키 색인)와 만난다. 타점 키로 저장하면 컷이 조용한 no-op 이 된다.
                // 옛 저장물(재편 전 day 축 컷 = 타점 키)은 그 키 그대로 토글해야 해제가 실제로 지운다.
                // 그 날 어느 타점 키로 저장됐든 찾는다 — 우클릭한 타점과 다른 타점의 키일 수 있다.
                const stored = cols.cuts[`ax:${ctx.axisId}`] ?? [];
                const freshKey = ax.scope === "day" ? chartKey(ctx.point) : rowKey(ctx.point);
                const legacyKey = ax.scope === "day" ? stored.find((k) => k !== freshKey && rowKeyToChartKey(k) === freshKey) : undefined;
                const cutKey = stored.includes(freshKey) ? freshKey : (legacyKey ?? freshKey);
                const cutOn = stored.includes(cutKey);
                const cutEnabled = sortAxisId === ctx.axisId; // 1차 정렬 축에서만 — 안 보이는 줄엔 선을 못 긋는다
                if (!cutEnabled && !cutOn) return null;
                return (
                    <AnchoredPopover anchor={ctx} onClose={m.close.ctx} minWidth={180} padding={0} placement="beside" offset={6}>
                        <MenuLabel>{ax.name} · {ctx.rank}/{ctx.total}위</MenuLabel>
                        <MenuItem onClick={() => { cols.toggleCut(ctx.axisId, cutKey); m.close.ctx(); }}>
                            {cutOn ? "그룹 나누기 해제" : "여기서 그룹 나누기"}
                        </MenuItem>
                    </AnchoredPopover>
                );
            })()}

            {hdrCtx && (
                <HeaderMenu anchor={hdrCtx} label={hdrCtx.label} frozen={hdrCtx.frozen} canHide={hdrCtx.canHide} canFreeze={hdrCtx.key !== "name"}
                    sortStep={sortLen > 1 ? hdrCtx.step : 0}
                    onToggleFreeze={() => { cols.toggleFrozen(hdrCtx.key); m.close.hdrCtx(); }}
                    onHide={() => { cols.toggleHidden(hdrCtx.key); m.close.hdrCtx(); }}
                    onDropSort={() => { dropSortKey(hdrCtx.sortKey); m.close.hdrCtx(); }}
                    onClose={m.close.hdrCtx} />
            )}
        </>
    );
}
