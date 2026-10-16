// 경로 — 상황 하나 = { 종목, 날짜, 시각 } (DESIGN 9절 「화면 틀」).
// 사용자가 A, B, C … 로 늘리고 줄인다. 패널은 경로 하나를 구독하거나 `활성`(마지막으로 조작한 경로)을 따라간다.
// 경로 목록·활성·패널 구독은 localStorage 에 남는다(배치와 함께 복원).
import { useCallback } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 상황 — 빈 문자열 = 미정. date `YYYY-MM-DD` · time `HH:MM`(미정 = 장 마감) · code 6자리. */
export interface Situation {
    code: string;
    date: string;
    time: string;
}

/** 시각 미정 = 장 마감 — 화면은 이 시각으로 보이고 이 시각의 값을 쓴다. */
export const CLOSE_TIME = "15:30";

export type PathId = string;
export const ACTIVE = "active";
/** 패널이 구독하는 대상 — 경로 하나, 또는 활성 경로를 따라감. */
export type PathRef = PathId | typeof ACTIVE;

export interface Path {
    id: PathId;
    color: string;
    s: Situation;
    /** 경로 줄에서 펼쳐 보이나 — 사용자가 이름표를 눌러 펼치고 접는다(활성과 따로). */
    open: boolean;
}

const COLORS = ["#2f6fde", "#e0592a", "#1f9d6b", "#9b51e0", "#c99400", "#d6336c", "#0e9fb3", "#6b7280"];
const EMPTY: Situation = { code: "", date: "", time: "" };

interface PathsState {
    paths: Path[];
    active: PathId;
    /** panelId → 구독. 없으면 활성. */
    bindings: Record<string, PathRef>;
    /** 새 경로 — 활성 경로의 상황을 복사해 시작한다("다른 날짜를 따로 보려면 경로를 하나 더"). */
    addPath: () => PathId;
    /** 경로 삭제(마지막 하나는 못 지운다). 그 경로를 보던 패널은 활성으로 돌아간다. */
    removePath: (id: PathId) => void;
    setActive: (id: PathId) => void;
    /** 경로 줄에서 펼침 ↔ 접음(활성은 그대로). */
    toggleOpen: (id: PathId) => void;
    /** 경로에 쓴다 — 쓴 경로가 활성이 된다(패널 안의 클릭 · 경로 줄의 날짜). */
    write: (id: PathId, patch: Partial<Situation>) => void;
    bind: (panelId: string, ref: PathRef) => void;
    /** 패널의 구독을 지운다(패널 영구 삭제). */
    unbind: (panelId: string) => void;
    /** 지금 없는 패널의 구독을 걷는다(배치 복원 뒤). */
    pruneBindings: (livePanelIds: string[]) => void;
}

function nextName(paths: Path[]): PathId {
    const used = new Set(paths.map((p) => p.id));
    for (let i = 0; i < 26; i++) {
        const name = String.fromCharCode(65 + i);
        if (!used.has(name)) return name;
    }
    for (let n = 27; ; n++) if (!used.has(`P${n}`)) return `P${n}`;
}

function nextColor(paths: Path[]): string {
    const used = new Set(paths.map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) ?? COLORS[paths.length % COLORS.length];
}

export const usePaths = create<PathsState>()(
    persist(
        (set, get) => ({
            paths: [
                { id: "A", color: COLORS[0], s: { ...EMPTY }, open: true },
                { id: "B", color: COLORS[1], s: { ...EMPTY }, open: false },
            ],
            active: "A",
            bindings: {},
            addPath: () => {
                const { paths, active } = get();
                const from = paths.find((p) => p.id === active)?.s ?? EMPTY;
                const id = nextName(paths);
                set({ paths: [...paths, { id, color: nextColor(paths), s: { ...from }, open: true }], active: id });
                return id;
            },
            removePath: (id) =>
                set((st) => {
                    if (st.paths.length <= 1) return st;
                    const paths = st.paths.filter((p) => p.id !== id);
                    const bindings = Object.fromEntries(Object.entries(st.bindings).filter(([, ref]) => ref !== id));
                    return { paths, bindings, active: st.active === id ? paths[0].id : st.active };
                }),
            toggleOpen: (id) => set((st) => ({ paths: st.paths.map((p) => (p.id === id ? { ...p, open: !p.open } : p)) })),
            setActive: (id) => set((st) => (st.paths.some((p) => p.id === id) ? { active: id } : st)),
            write: (id, patch) =>
                set((st) => ({
                    paths: st.paths.map((p) => (p.id === id ? { ...p, s: { ...p.s, ...patch } } : p)),
                    active: st.paths.some((p) => p.id === id) ? id : st.active,
                })),
            bind: (panelId, ref) => set((st) => ({ bindings: { ...st.bindings, [panelId]: ref } })),
            unbind: (panelId) =>
                set((st) => {
                    const bindings = { ...st.bindings };
                    delete bindings[panelId];
                    return { bindings };
                }),
            pruneBindings: (live) =>
                set((st) => {
                    const keep = new Set(live);
                    return { bindings: Object.fromEntries(Object.entries(st.bindings).filter(([id]) => keep.has(id))) };
                }),
        }),
        {
            name: "trade-lab.paths",
            version: 3,
            // v1 → v2: 상황에서 테마를 뺐다(테마는 테마 패널 안에서만 다룬다).
            // v2 → v3: 펼침(open)을 사용자가 정한다 — 그전엔 활성 경로만 펼쳐 보였으니 그대로 옮긴다.
            migrate: (persisted, version) => {
                const st = persisted as { active?: string; paths?: { id: string; open?: boolean; s: Partial<Situation> & { theme?: string } }[] };
                if (version < 2) for (const p of st.paths ?? []) delete p.s.theme;
                if (version < 3) for (const p of st.paths ?? []) p.open = p.id === st.active;
                return st as never;
            },
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ paths: st.paths, active: st.active, bindings: st.bindings }),
        },
    ),
);

/**
 * 사용자가 패널(탭·본문)을 눌러 고르면 그 패널이 보는 경로가 활성 — 경로에 고정된 패널만(활성을 따라가는 패널은
 * 이미 활성을 본다). dockview 의 활성 패널 신호가 아니라 누름에 건다: 최소화·화면 불러오기로 옆 패널이 활성이 되는 것은
 * 사용자가 고른 게 아니고, 이미 활성인 패널을 다시 눌러도 그 경로로 돌아와야 한다.
 */
export function selectPanelPath(panelId: string): void {
    const st = usePaths.getState();
    const ref = st.bindings[panelId] ?? ACTIVE;
    if (ref !== ACTIVE && ref !== st.active) st.setActive(ref); // 지워진 경로면 setActive 가 무시한다
}

/** 구독 → 실제 경로 id. 지워진 경로를 가리키면 활성으로. */
export function resolvePathId(st: Pick<PathsState, "paths" | "active">, ref: PathRef): PathId {
    if (ref !== ACTIVE && st.paths.some((p) => p.id === ref)) return ref;
    return st.active;
}

export interface PanelPath {
    /** 패널의 구독(토글 값). */
    ref: PathRef;
    /** 지금 보는 경로. */
    path: Path;
    /** 이 패널이 보는 경로에 쓴다(그 경로가 활성이 된다). */
    write: (patch: Partial<Situation>) => void;
}

/** 패널 → 그 패널이 보는 경로. 패널 안의 클릭은 전부 write 로 쓴다. */
export function usePanelPath(panelId: string): PanelPath {
    const ref = usePaths((st) => st.bindings[panelId] ?? ACTIVE);
    const path = usePaths((st) => {
        const id = resolvePathId(st, ref);
        return st.paths.find((p) => p.id === id) ?? st.paths[0];
    });
    const write = useCallback((patch: Partial<Situation>) => usePaths.getState().write(path.id, patch), [path.id]);
    return { ref, path, write };
}
