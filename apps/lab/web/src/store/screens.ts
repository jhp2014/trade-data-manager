// 저장한 화면 — 배치(dockview JSON) + 그 배치에 든 패널마다의 경로 구독·화면 설정.
// 개수 제한이 없고, 원하는 화면에만 번호(1~9)를 짝지어 Ctrl+번호로 부른다.
// 경로(A·B 의 종목·날짜)는 화면에 넣지 않는다 — 화면은 "어떻게 보느냐", 경로는 "무엇을 보느냐".
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SerializedDockview } from "dockview-react";
import type { PathRef } from "./paths.js";

export interface ScreenSnapshot {
    layout: SerializedDockview;
    /** panelId → 그 패널의 구독과 화면 설정. */
    panels: Record<string, { ref: PathRef; ui?: Record<string, unknown> }>;
}

export interface Screen extends ScreenSnapshot {
    id: string;
    name: string;
    savedAt: number;
}

export const SCREEN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

interface ScreensState {
    screens: Screen[];
    /** 번호 → 화면 id. 번호 하나에 화면 하나, 화면 하나에 번호 하나. */
    keys: Partial<Record<ScreenKey, string>>;
    /** 마지막으로 불러온(또는 저장한) 화면. 세션 값. */
    activeId: string | null;
    /** 새 화면으로 저장 — id 를 돌려준다. */
    add: (name: string, snap: ScreenSnapshot) => string;
    overwrite: (id: string, snap: ScreenSnapshot) => void;
    rename: (id: string, name: string) => void;
    remove: (id: string) => void;
    /** 번호 짝짓기 — null 이면 떼기. 그 번호를 쓰던 다른 화면에서는 떨어진다. */
    setKey: (id: string, key: ScreenKey | null) => void;
    setActive: (id: string | null) => void;
}

const newId = (): string => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 번호 붙은 화면들 — 번호 순. 지워진 화면을 가리키는 번호는 빠진다. 작업표시줄 버튼과 Ctrl+번호가 같이 쓴다. */
export function keyedScreens(screens: readonly Screen[], keys: ScreensState["keys"]): { key: ScreenKey; screen: Screen }[] {
    return SCREEN_KEYS.flatMap((key) => {
        const screen = screens.find((s) => s.id === keys[key]);
        return screen ? [{ key, screen }] : [];
    });
}

/** 화면에 짝지어진 번호(없으면 null). */
export function keyOf(keys: ScreensState["keys"], id: string): ScreenKey | null {
    return SCREEN_KEYS.find((k) => keys[k] === id) ?? null;
}

export const useScreens = create<ScreensState>()(
    persist(
        (set) => ({
            screens: [],
            keys: {},
            activeId: null,
            add: (name, snap) => {
                const id = newId();
                set((st) => ({ screens: [...st.screens, { id, name, savedAt: Date.now(), ...snap }], activeId: id }));
                return id;
            },
            overwrite: (id, snap) =>
                set((st) => ({ screens: st.screens.map((s) => (s.id === id ? { ...s, ...snap, savedAt: Date.now() } : s)), activeId: id })),
            rename: (id, name) => set((st) => ({ screens: st.screens.map((s) => (s.id === id ? { ...s, name } : s)) })),
            remove: (id) =>
                set((st) => ({
                    screens: st.screens.filter((s) => s.id !== id),
                    keys: Object.fromEntries(Object.entries(st.keys).filter(([, v]) => v !== id)),
                    activeId: st.activeId === id ? null : st.activeId,
                })),
            setKey: (id, key) =>
                set((st) => {
                    const keys = Object.fromEntries(Object.entries(st.keys).filter(([, v]) => v !== id)) as ScreensState["keys"];
                    if (key) keys[key] = id;
                    return { keys };
                }),
            setActive: (id) => set({ activeId: id }),
        }),
        {
            name: "trade-lab.screens",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ screens: st.screens, keys: st.keys }),
        },
    ),
);
