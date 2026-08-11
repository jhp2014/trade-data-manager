// rankViewSlice — 배치(레인)·시트 두 뷰가 공유하는 상호작용 상태. 링크의 단일 진실.
//  · hoveredPoint: 포인터 스침 1개(양 패널 링크) — 그 타점을 전 축에서 강조(프로파일).
//  · pinned: 핀=작업셋=배치 보드 트레이(공유 하나). 배치 드래그 소스 + 시트 상단 고정.
//  · rankAxisOrder: 축 열/레인 순서 — 양방향 동기화(양쪽에서 재정렬), localStorage 영속.
//  · savedFilters: 이름 붙인 **필터 전체 스냅샷**(양 패널 공유, 영속).
//  · revealAxis: "저 축을 보여줘" 요청(타점 정보 → 배치 보드 레인 스크롤). at 타임스탬프로 같은 축 재요청도 발화.
// (소프트 선택은 폐기 — 필터 좁히기/흐리게로 충분, 드래그도 제거.)
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import type { AxisValueRange, DateRange, RankBand, TimeRange } from "./rankFilterSlice.js";
import { parseGroupExpr, type GroupExpr } from "../panels/rank/groupFilter.js";
import { loadJson, saveJson } from "./persist.js";

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const SAVED_KEY = "wb.rankSavedFilters";
const loadOrder = (): string[] => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [];
const loadSaved = (): SavedFilter[] => loadJson(SAVED_KEY, (o) => (Array.isArray(o) ? (o as SavedFilter[]) : null)) ?? [];

/**
 * 저장 필터 — 이름 붙인 **필터 전체 스냅샷**(양 패널 공유, localStorage 영속).
 * 예전엔 밴드만 담아서 불러오기가 날짜·시간을 재현하지 못했다(저장한 것과 다른 결과가 나온다).
 * 밴드 밖 차원은 optional — 옛 저장본(밴드만 있는)을 그대로 읽고, 없는 차원은 "무제한"으로 적용된다.
 */
export interface SavedFilter {
    id: string;
    name: string;
    bands: Record<string, RankBand>;
    /** 계산 축 값 구간(브릭 2에서 추가) — 없는 옛 저장본은 무제한으로 적용된다. */
    axisValueRanges?: Record<string, AxisValueRange[]>;
    dateRanges?: DateRange[];
    timeRanges?: TimeRange[];
    groupExpr?: GroupExpr;
}

/** 불러올 때 적용할 값 — 없는 차원은 빈 값(무제한)으로 채운다. groupExpr 은 형태 검증까지. */
export function savedFilterSnapshot(f: SavedFilter): { bands: Record<string, RankBand>; axisValueRanges: Record<string, AxisValueRange[]>; dateRanges: DateRange[]; timeRanges: TimeRange[]; groupExpr: GroupExpr } {
    return {
        bands: f.bands ?? {},
        axisValueRanges: f.axisValueRanges ?? {},
        dateRanges: Array.isArray(f.dateRanges) ? f.dateRanges : [],
        timeRanges: Array.isArray(f.timeRanges) ? f.timeRanges : [],
        groupExpr: parseGroupExpr(f.groupExpr) ?? { groups: [] },
    };
}

export interface RankViewSlice {
    hoveredPoint: string | null;
    pinned: string[]; // 핀=작업셋 pk[](순서 유지 = 담은 순). 배치 보드 트레이와 같은 상태.
    savedFilters: SavedFilter[]; // 저장 필터(양 패널 공유, 영속)
    rankAxisOrder: string[]; // axisId 순서(빈 배열 = 서버순 폴백). pref 에 없는 새 축은 소비측이 뒤로.
    rankSort: { target: string; dir: 1 | -1 } | null; // 시트 정렬 기준 → 배치 보드 하이라이트(target = axisId | "date" | "time"). 세션 한정.
    revealAxis: { axisId: string; at: number } | null; // 축 노출 요청(세션 한정, 소비 후에도 남음 — at 비교로 1회 처리)
    setHoveredPoint: (key: string | null) => void;
    revealRankAxis: (axisId: string) => void;
    setRankSort: (v: { target: string; dir: 1 | -1 } | null) => void;
    togglePin: (key: string) => void; // 담기/빼기(+/× 공용)
    addPins: (keys: string[]) => void; // 여러 개 한 번에(끝에 append)
    clearPins: () => void;
    saveFilter: (name: string, snapshot: Omit<SavedFilter, "id" | "name">) => void;
    renameFilter: (id: string, name: string) => void;
    deleteFilter: (id: string) => void;
    setRankAxisOrder: (order: string[]) => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    hoveredPoint: null,
    pinned: [],
    savedFilters: loadSaved(),
    rankAxisOrder: loadOrder(),
    rankSort: null,
    revealAxis: null,

    setHoveredPoint: (key) => set(() => ({ hoveredPoint: key })),
    revealRankAxis: (axisId) => set(() => ({ revealAxis: { axisId, at: Date.now() } })),
    setRankSort: (v) => set(() => ({ rankSort: v })),
    togglePin: (key) => set((s) => (s.pinned.includes(key) ? { pinned: s.pinned.filter((k) => k !== key) } : { pinned: [...s.pinned, key] })),
    addPins: (keys) => set((s) => ({ pinned: [...s.pinned, ...keys.filter((k) => !s.pinned.includes(k))] })),
    clearPins: () => set(() => ({ pinned: [] })),
    saveFilter: (name, snapshot) => set((s) => { const next = [...s.savedFilters, { id: `f${Date.now()}`, name, ...snapshot }]; saveJson(SAVED_KEY, next); return { savedFilters: next }; }),
    renameFilter: (id, name) => set((s) => { const next = s.savedFilters.map((f) => (f.id === id ? { ...f, name } : f)); saveJson(SAVED_KEY, next); return { savedFilters: next }; }),
    deleteFilter: (id) => set((s) => { const next = s.savedFilters.filter((f) => f.id !== id); saveJson(SAVED_KEY, next); return { savedFilters: next }; }),
    setRankAxisOrder: (order) => { saveJson(AXIS_ORDER_KEY, order); set(() => ({ rankAxisOrder: order })); },
});
