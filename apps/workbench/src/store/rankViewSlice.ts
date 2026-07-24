// rankViewSlice — 배치(레인)·시트 두 뷰가 공유하는 상호작용 상태. 링크의 단일 진실.
//  · softSelected: 드래그로 만든 소프트 선택 세트(pk "code|date|time"). 색만 입히고 **안 좁힘**. 여러 번 띄어 누적.
//    (좁히기=필터는 우클릭 밴드=rankFilterSlice 로 별개.)
//  · hoveredPoint: 포인터 스침 1개 — 양 패널 링크(옅은 강조).
//  · rankAxisOrder: 축 열/레인 순서 — 양방향 동기화(양쪽에서 재정렬), localStorage 영속.
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import { loadJson, saveJson } from "./persist.js";

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const loadOrder = (): string[] => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [];

export interface RankViewSlice {
    softSelected: string[]; // 소프트 선택 pk 목록(중복 없음, 순서 무관)
    hoveredPoint: string | null;
    rankAxisOrder: string[]; // axisId 순서(빈 배열 = 서버순 폴백). pref 에 없는 새 축은 소비측이 뒤로.
    addSoftSelect: (keys: string[]) => void; // 합집합(드래그 누적)
    toggleSoftSelect: (key: string) => void; // 클릭 토글
    clearSoftSelect: () => void;
    setHoveredPoint: (key: string | null) => void;
    setRankAxisOrder: (order: string[]) => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    softSelected: [],
    hoveredPoint: null,
    rankAxisOrder: loadOrder(),

    addSoftSelect: (keys) => set((s) => ({ softSelected: [...new Set([...s.softSelected, ...keys])] })),
    toggleSoftSelect: (key) =>
        set((s) => (s.softSelected.includes(key) ? { softSelected: s.softSelected.filter((k) => k !== key) } : { softSelected: [...s.softSelected, key] })),
    clearSoftSelect: () => set(() => ({ softSelected: [] })),
    setHoveredPoint: (key) => set(() => ({ hoveredPoint: key })),
    setRankAxisOrder: (order) => { saveJson(AXIS_ORDER_KEY, order); set(() => ({ rankAxisOrder: order })); },
});
