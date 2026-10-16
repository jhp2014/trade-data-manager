// 패널별 화면 설정(차트 일봉/분봉 보기 · KRX/통합 등) — panelId 단위로 갈라 복제한 패널끼리 섞이지 않는다.
// localStorage 에 남는다(배치와 함께 복원).
import { useCallback } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PanelUiState {
    /** panelId → 키 → 값 */
    ui: Record<string, Record<string, unknown>>;
    set: (panelId: string, key: string, value: unknown) => void;
    /**
     * 패널 설정 통째로 — undefined 면 지운다. 새 패널을 붙일 때 늘 부른다: 패널 id 는 비어 있는 번호를
     * 다시 쓰므로(chart-2 를 닫고 새로 열면 다시 chart-2), 안 지우면 지난 패널의 설정을 물려받는다.
     */
    replace: (panelId: string, ui: Record<string, unknown> | undefined) => void;
    /** 지금 없는 패널의 설정을 걷는다(배치 복원 뒤). */
    prune: (livePanelIds: string[]) => void;
}

export const usePanelUiStore = create<PanelUiState>()(
    persist(
        (set) => ({
            ui: {},
            set: (panelId, key, value) => set((st) => ({ ui: { ...st.ui, [panelId]: { ...st.ui[panelId], [key]: value } } })),
            replace: (panelId, ui) =>
                set((st) => {
                    const next = { ...st.ui };
                    if (ui) next[panelId] = { ...ui };
                    else delete next[panelId];
                    return { ui: next };
                }),
            prune: (live) =>
                set((st) => {
                    const keep = new Set(live);
                    return { ui: Object.fromEntries(Object.entries(st.ui).filter(([id]) => keep.has(id))) };
                }),
        }),
        {
            name: "trade-lab.panelUi",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ ui: st.ui }),
        },
    ),
);

/** 패널 설정 하나(선택지) — [값, 바꾸기]. 저장값이 허용 목록(allowed)에 없으면 기본값(옛 저장물·오타 방어). */
export function usePanelUi<T extends string>(panelId: string, key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
    const raw = usePanelUiStore((st) => st.ui[panelId]?.[key]);
    const value = allowed.includes(raw as T) ? (raw as T) : fallback;
    const setValue = useCallback((v: T) => usePanelUiStore.getState().set(panelId, key, v), [panelId, key]);
    return [value, setValue];
}

/** 패널 설정 하나(정수) — [값, 바꾸기]. 저장값이 정수가 아니거나 범위 밖이면 범위로 자르고, 없으면 기본값. */
export function usePanelUiNumber(panelId: string, key: string, range: { min: number; max: number }, fallback: number): [number, (v: number) => void] {
    const raw = usePanelUiStore((st) => st.ui[panelId]?.[key]);
    const clamp = useCallback((v: number) => Math.min(range.max, Math.max(range.min, Math.round(v))), [range.min, range.max]);
    const value = typeof raw === "number" && Number.isFinite(raw) ? clamp(raw) : fallback;
    const setValue = useCallback((v: number) => usePanelUiStore.getState().set(panelId, key, clamp(v)), [panelId, key, clamp]);
    return [value, setValue];
}

/** 패널 설정 하나(글자) — [값, 바꾸기]. 저장값이 글자가 아니면 기본값. 검색어처럼 다시 붙이거나 화면을 불러와도 남아야 하는 입력. */
export function usePanelUiText(panelId: string, key: string, fallback = ""): [string, (v: string) => void] {
    const raw = usePanelUiStore((st) => st.ui[panelId]?.[key]);
    const value = typeof raw === "string" ? raw : fallback;
    const setValue = useCallback((v: string) => usePanelUiStore.getState().set(panelId, key, v), [panelId, key]);
    return [value, setValue];
}
