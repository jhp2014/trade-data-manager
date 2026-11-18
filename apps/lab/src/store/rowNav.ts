// w/s 순회 — 판이 순회 대상을 등록하고, **부착된 판 하나**가 w/s(step)·shift+w/s(stepGroup)를 받는다
// (decisions 「lab w/s 순회 — 판을 부착한다」). 키는 정적 커맨드 한 벌(keymap/registry)이 이 모듈로 보낸다 —
// 걷고 싶은 판은 useNavTarget 으로 대상을 등록하고 카탈로그에 walkable 을 켠다. 부착 손 = 탭 우클릭 「w/s 부착」(shell/PanelTab) 하나.
// 부착은 영속(배치처럼 다시 열어도 남는다). 등록 안 된 부착 판(닫힘·본문 없음)이면 w/s 는 조용히 쉰다.
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type NavDir = 1 | -1;

export interface NavTarget {
    /** w/s — 한 줄 위·아래. */
    step: (dir: NavDir) => void;
    /** shift+w/s — 한 묶음 위·아래(테마 보드라면 선택 테마). */
    stepGroup: (dir: NavDir) => void;
}

interface RowNavState {
    /** 부착된 판(panelId) — 없으면 null. */
    attached: string | null;
    attach: (panelId: string) => void;
    /** 그 판이 부착돼 있으면 뗀다 — 판이 영구 삭제되거나 그 번호로 새 판이 태어날 때(번호 재사용이 부착을 물려받지 않게). */
    detach: (panelId: string) => void;
    /** 대장에 없는 판의 부착을 걷는다(배치 복원 뒤). */
    prune: (livePanelIds: readonly string[]) => void;
}

export const useRowNav = create<RowNavState>()(
    persist(
        (set) => ({
            attached: null,
            attach: (panelId) => set({ attached: panelId }),
            detach: (panelId) => set((st) => (st.attached === panelId ? { attached: null } : st)),
            prune: (live) => set((st) => (st.attached !== null && !live.includes(st.attached) ? { attached: null } : st)),
        }),
        { name: "trade-lab.rowNav", version: 1, storage: createJSONStorage(() => localStorage), partialize: (st) => ({ attached: st.attached }) },
    ),
);

/** 지금 등록된 순회 대상 — 키를 누를 때만 읽으므로 반응형일 필요가 없다. */
const targets = new Map<string, NavTarget>();

/** 부착된 판에 한 걸음 — 정적 커맨드(w/s · shift+w/s)가 부른다. 부착 판이 등록돼 있지 않으면 아무 일도 없다. */
export function walk(kind: keyof NavTarget, dir: NavDir): void {
    const id = useRowNav.getState().attached;
    const t = id === null ? undefined : targets.get(id);
    t?.[kind](dir);
}

/**
 * 판의 순회 대상 등록 — target 이 null 이면 등록하지 않는다(본문을 그리지 않는 동안: 로딩·대기·오류 — 옛 목록으로
 * 걷지 않게). 판 최상단에서 부른다(조기 반환 아래서 부르면 데이터가 바뀔 때마다 등록이 깜빡인다).
 */
export function useNavTarget(panelId: string, target: NavTarget | null): void {
    useEffect(() => {
        if (target === null) return;
        targets.set(panelId, target);
        return () => {
            if (targets.get(panelId) === target) targets.delete(panelId);
        };
    }, [panelId, target]);
}

/** 이 판이 부착돼 있나 — 탭의 ● · 판 안 선택 커서 강조(부착 판에서만)를 그릴지. */
export function useIsAttached(panelId: string): boolean {
    return useRowNav((st) => st.attached === panelId);
}
