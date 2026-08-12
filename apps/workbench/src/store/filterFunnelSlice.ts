// 필터 깔때기 슬라이스 — **순서 있는 단계 리스트**. 조건이 사는 단 하나의 자리.
//
// 옛 rankFilterSlice 는 차원별로 자리가 정해진 평평한 가방이었다(밴드는 여기, 날짜는 저기…).
// 그 모양으로는 "단계 3개, 2번은 끄고, 1·3 순서 바꾸기"를 표현할 수 없다 — 차원이 곧 자리라서
// 순서라는 개념이 없다. 깔때기는 순서로 이야기를 만들므로(어느 단계가 무엇을 죽였나) 리스트여야 한다.
//
// ⚠ 옛 슬라이스와 **동기화하지 않는다.** 소비자 이관이 끝나면 옛 슬라이스는 지운다. 두 상태를 잇는
// 다리를 놓는 순간 "어느 게 진짜 조건이냐"가 두 곳이 되고, 그게 지금 필터 UI 가 두 곳이라 생긴 문제와
// 정확히 같은 종류다. 그때까지는 이 슬라이스를 읽는 곳이 없다(그래서 공존해도 모호하지 않다).
//
// 옛 저장 필터(wb.rankSavedFilters)는 변환하지 않는다 — 한 번 쓰고 버릴 변환 코드에 옛 형식 지식이
// 박히면 나중에 "이건 왜 있지"가 된다. 새 키로 시작하고 옛 키는 안 읽어서 자연히 죽게 둔다.
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import {
    addStage, moveStage, parseStages, removeStage, renameStage, setStagePredicates, toggleStage,
    type FilterPredicate, type FilterStage,
} from "../panels/filter/stage.js";
import { loadJson, saveJson } from "./persist.js";

const STAGES_KEY = "wb.filterStages";
const EXPAND_KEY = "wb.filterExpandToPoints";

const loadStages = (): FilterStage[] => loadJson(STAGES_KEY, parseStages) ?? [];
const loadExpand = (): boolean => loadJson(EXPAND_KEY, (o) => (typeof o === "boolean" ? o : null)) ?? false;

export interface FilterFunnelSlice {
    filterStages: FilterStage[];
    /**
     * 결과를 타점까지 펼칠까 — **자동 해상도가 하루일 때만** 뜻이 있다(이미 타점이면 더 내려갈 데가 없다).
     * 위로 올리는 손잡이는 없다: 롤업 규칙이 정의되지 않아서다(stage.displayGrain 주석 참고).
     */
    filterExpandToPoints: boolean;
    addFilterStage: (predicates?: FilterPredicate[]) => void;
    removeFilterStage: (id: string) => void;
    toggleFilterStage: (id: string) => void;
    moveFilterStage: (from: number, to: number) => void;
    setFilterStagePredicates: (id: string, predicates: FilterPredicate[]) => void;
    renameFilterStage: (id: string, name: string) => void;
    clearFilterStages: () => void;
    setFilterExpandToPoints: (on: boolean) => void;
}

/** 단계는 손으로 쌓는 것이라 매 편집이 곧 영속 — 새로고침에 조건이 날아가면 깔때기를 다시 짜야 한다. */
const put = (stages: FilterStage[]): { filterStages: FilterStage[] } => {
    saveJson(STAGES_KEY, stages);
    return { filterStages: stages };
};

export const createFilterFunnelSlice: StateCreator<WorkbenchState, [], [], FilterFunnelSlice> = (set) => ({
    filterStages: loadStages(),
    filterExpandToPoints: loadExpand(),

    addFilterStage: (predicates) => set((s) => put(addStage(s.filterStages, predicates ?? []))),
    removeFilterStage: (id) => set((s) => put(removeStage(s.filterStages, id))),
    toggleFilterStage: (id) => set((s) => put(toggleStage(s.filterStages, id))),
    moveFilterStage: (from, to) => set((s) => put(moveStage(s.filterStages, from, to))),
    setFilterStagePredicates: (id, predicates) => set((s) => put(setStagePredicates(s.filterStages, id, predicates))),
    renameFilterStage: (id, name) => set((s) => put(renameStage(s.filterStages, id, name))),
    clearFilterStages: () => set(() => put([])),
    setFilterExpandToPoints: (on) => {
        saveJson(EXPAND_KEY, on);
        set(() => ({ filterExpandToPoints: on }));
    },
});
