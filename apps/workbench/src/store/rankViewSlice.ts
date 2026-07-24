// rankViewSlice — 배치(레인)·시트 두 뷰가 공유하는 상호작용 상태. 링크의 단일 진실.
//  · softSelected: **축별** 소프트 선택(axisId → pk[]). 한 축을 드래그하면 그 축만 물든다(행 전체 X).
//    양 패널 그 축의 셀/레인만 강조. 색만 입히고 **안 좁힘**. 여러 축 각각 누적. (좁히기=우클릭 밴드=rankFilterSlice.)
//  · hoveredPoint: 포인터 스침 1개 — 이건 점 단위(그 타점을 전 축에서 강조=프로파일).
//  · rankAxisOrder: 축 열/레인 순서 — 양방향 동기화(양쪽에서 재정렬), localStorage 영속.
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import { loadJson, saveJson } from "./persist.js";

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const loadOrder = (): string[] => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [];

export interface RankViewSlice {
    softSelected: Record<string, string[]>; // axisId → 소프트 선택 pk[](중복 없음)
    hoveredPoint: string | null;
    rankAxisOrder: string[]; // axisId 순서(빈 배열 = 서버순 폴백). pref 에 없는 새 축은 소비측이 뒤로.
    addSoftSelect: (axisId: string, keys: string[]) => void; // 그 축 세트에 합집합(드래그 누적)
    clearSoftSelect: () => void;
    setHoveredPoint: (key: string | null) => void;
    setRankAxisOrder: (order: string[]) => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    softSelected: {},
    hoveredPoint: null,
    rankAxisOrder: loadOrder(),

    addSoftSelect: (axisId, keys) =>
        set((s) => ({ softSelected: { ...s.softSelected, [axisId]: [...new Set([...(s.softSelected[axisId] ?? []), ...keys])] } })),
    clearSoftSelect: () => set(() => ({ softSelected: {} })),
    setHoveredPoint: (key) => set(() => ({ hoveredPoint: key })),
    setRankAxisOrder: (order) => { saveJson(AXIS_ORDER_KEY, order); set(() => ({ rankAxisOrder: order })); },
});
