// rankViewSlice — 배치(레인)·시트 두 뷰가 공유하는 상호작용 상태. 링크의 단일 진실.
//  · hoveredPoint: 포인터 스침 1개(양 패널 링크) — 그 타점을 전 축에서 강조(프로파일).
//  · pinned: 핀=작업셋=배치 보드 트레이(공유 하나). 배치 드래그 소스 + 시트 상단 고정.
//  · rankAxisOrder: 축 열/레인 순서 — 양방향 동기화(양쪽에서 재정렬), localStorage 영속.
//  · savedFilters: 이름 붙인 밴드 조합(양 패널 공유, 영속).
// (소프트 선택은 폐기 — 필터 좁히기/흐리게로 충분, 드래그도 제거.)
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import type { RankBand } from "./rankFilterSlice.js";
import { loadJson, saveJson } from "./persist.js";

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const SAVED_KEY = "wb.rankSavedFilters";
const loadOrder = (): string[] => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [];
const loadSaved = (): SavedFilter[] => loadJson(SAVED_KEY, (o) => (Array.isArray(o) ? (o as SavedFilter[]) : null)) ?? [];

/** 저장 필터 — 이름 붙인 밴드 조합(양 패널 공유, localStorage 영속). */
export interface SavedFilter { id: string; name: string; bands: Record<string, RankBand>; }

export interface RankViewSlice {
    hoveredPoint: string | null;
    pinned: string[]; // 핀=작업셋 pk[](순서 유지 = 담은 순). 배치 보드 트레이와 같은 상태.
    savedFilters: SavedFilter[]; // 저장 필터(양 패널 공유, 영속)
    rankAxisOrder: string[]; // axisId 순서(빈 배열 = 서버순 폴백). pref 에 없는 새 축은 소비측이 뒤로.
    setHoveredPoint: (key: string | null) => void;
    togglePin: (key: string) => void; // 담기/빼기(+/× 공용)
    addPins: (keys: string[]) => void; // 여러 개 한 번에(끝에 append)
    clearPins: () => void;
    saveFilter: (name: string, bands: Record<string, RankBand>) => void;
    renameFilter: (id: string, name: string) => void;
    deleteFilter: (id: string) => void;
    setRankAxisOrder: (order: string[]) => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    hoveredPoint: null,
    pinned: [],
    savedFilters: loadSaved(),
    rankAxisOrder: loadOrder(),

    setHoveredPoint: (key) => set(() => ({ hoveredPoint: key })),
    togglePin: (key) => set((s) => (s.pinned.includes(key) ? { pinned: s.pinned.filter((k) => k !== key) } : { pinned: [...s.pinned, key] })),
    addPins: (keys) => set((s) => ({ pinned: [...s.pinned, ...keys.filter((k) => !s.pinned.includes(k))] })),
    clearPins: () => set(() => ({ pinned: [] })),
    saveFilter: (name, bands) => set((s) => { const next = [...s.savedFilters, { id: `f${Date.now()}`, name, bands }]; saveJson(SAVED_KEY, next); return { savedFilters: next }; }),
    renameFilter: (id, name) => set((s) => { const next = s.savedFilters.map((f) => (f.id === id ? { ...f, name } : f)); saveJson(SAVED_KEY, next); return { savedFilters: next }; }),
    deleteFilter: (id) => set((s) => { const next = s.savedFilters.filter((f) => f.id !== id); saveJson(SAVED_KEY, next); return { savedFilters: next }; }),
    setRankAxisOrder: (order) => { saveJson(AXIS_ORDER_KEY, order); set(() => ({ rankAxisOrder: order })); },
});
