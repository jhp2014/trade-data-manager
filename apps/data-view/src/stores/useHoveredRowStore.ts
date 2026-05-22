import { create } from "zustand";
import type { ThemeRowData } from "@/types/deck";
import type { ActivePool } from "@/lib/filter/kinds/types";

/**
 * 현재 마우스가 hover 중인 row 의 정보를 전역으로 관리한다.
 *
 * 목적:
 *  - 각 EntryRow 가 `document.addEventListener("keydown", ...)` 를
 *    개별 등록하면 가상화 환경에서 보이지 않는 row 의 핸들러까지 등록되거나
 *    중복 등록될 위험이 있다.
 *  - 글로벌 핸들러 1개 + "현재 hovered row" 단일 상태로 단순화한다.
 *
 * key 는 `rowKey(row)` 와 동일한 형식을 사용한다.
 */
export interface HoveredRowContext {
    key: string;
    row: ThemeRowData;
    activePools: ActivePool[];
}

interface HoveredRowState {
    hovered: HoveredRowContext | null;
    setHovered: (ctx: HoveredRowContext) => void;
    /**
     * 현재 hovered 가 주어진 key 와 일치할 때만 해제한다.
     * 빠른 마우스 이동으로 enter → leave 가 엇갈렸을 때 다른 row 의
     * 상태를 덮어쓰는 것을 방지한다.
     */
    clearIfMatches: (key: string) => void;
    clear: () => void;
}

export const useHoveredRowStore = create<HoveredRowState>((set, get) => ({
    hovered: null,
    setHovered: (ctx) => set({ hovered: ctx }),
    clearIfMatches: (key) => {
        const cur = get().hovered;
        if (cur && cur.key === key) set({ hovered: null });
    },
    clear: () => set({ hovered: null }),
}));
