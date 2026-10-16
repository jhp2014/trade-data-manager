// 패널 대장 — 지금 존재하는 패널 인스턴스(열린 것 + 최소화한 것)의 목록.
// 최소화 = dockview 에서 닫기. 닫혀도 대장에 남아 작업표시줄 칩이 되고, 그 패널의 경로 구독·화면 설정도 남는다.
// 대장에서 빼는 것(영구 삭제)은 작업표시줄 칩의 × 하나뿐이다.
// (workbench 의 "슬롯 대장"과 같은 이유 — 하나 더 연 chart-3 은 카탈로그에 없으니, 닫았을 때 기록이
//  어디에도 없으면 칩 없이 사라진다.)
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface DockState {
    /** 패널 인스턴스 대장(열림 + 최소화). */
    slots: string[];
    /** 지금 dockview 에 열린 패널. 셸이 준비되기 전엔 null. 세션 값(저장 안 함). */
    openIds: string[] | null;
    /** 대장에 합친다(이미 있으면 그대로). */
    register: (ids: string[]) => void;
    /** 대장에서 뺀다. */
    forget: (id: string) => void;
    setOpen: (ids: string[]) => void;
}

export const useDock = create<DockState>()(
    persist(
        (set) => ({
            slots: [],
            openIds: null,
            register: (ids) =>
                set((st) => {
                    const add = ids.filter((id) => !st.slots.includes(id));
                    return add.length ? { slots: [...st.slots, ...add] } : st;
                }),
            forget: (id) => set((st) => ({ slots: st.slots.filter((s) => s !== id) })),
            setOpen: (ids) => set({ openIds: ids }),
        }),
        {
            name: "trade-lab.dock",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ slots: st.slots }),
        },
    ),
);
