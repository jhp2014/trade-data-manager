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
import type { FunnelCell } from "@trade-data-manager/market/domain";
import type { WorkbenchState } from "./workbench.js";
import {
    activeStages, addStage, moveStage, parseStages, removeStage, renameStage, setStagePredicates, toggleStage,
    type FilterPredicate, type FilterStage,
} from "../panels/filter/stage.js";
import { applyRailPredicate, type RailKey } from "../panels/filter/stageBinding.js";
import { loadJson, saveJson } from "./persist.js";

const STAGES_KEY = "wb.filterStages"; // 슬롯 도입 전의 단일 벌 — 슬롯 1로 읽어 들이는 이관용(이제 안 쓴다)
const SLOTS_KEY = "wb.filterSlots";
const EXPAND_KEY = "wb.filterExpandToPoints";
const SETS_KEY = "wb.filterFunnelSets";

/** 필터 슬롯 수 — 이름 없는 고정 3칸(사용자 확정). A/B 비교·잠깐 딴 조합을 위한 휘발성 작업면. */
export const FILTER_SLOT_COUNT = 3;

const loadExpand = (): boolean => loadJson(EXPAND_KEY, (o) => (typeof o === "boolean" ? o : null)) ?? false;

/** 슬롯 3벌 + 활성 인덱스. 옛 단일 키(wb.filterStages)는 슬롯 1로 이관하고 자연히 죽게 둔다. */
const loadSlots = (): { active: number; slots: FilterStage[][] } => {
    const raw = loadJson(SLOTS_KEY, (o) => (typeof o === "object" && o !== null ? (o as { active?: unknown; slots?: unknown }) : null));
    if (raw && Array.isArray(raw.slots)) {
        const arr = raw.slots as unknown[];
        const slots = Array.from({ length: FILTER_SLOT_COUNT }, (_, i) => parseStages(arr[i]) ?? []);
        const active = typeof raw.active === "number" && Number.isInteger(raw.active) && raw.active >= 0 && raw.active < FILTER_SLOT_COUNT ? raw.active : 0;
        return { active, slots };
    }
    const legacy = loadJson(STAGES_KEY, parseStages) ?? [];
    return { active: 0, slots: Array.from({ length: FILTER_SLOT_COUNT }, (_, i) => (i === 0 ? legacy : [])) };
};
const saveSlots = (active: number, slots: FilterStage[][]): void => saveJson(SLOTS_KEY, { active, slots });

/**
 * 저장한 깔때기(단계 리스트 전체 스냅샷) — 이름 붙여 두고 통째로 불러온다. 옛 "저장 필터"의 후계.
 * 죽은 참조(그 사이 지워진 그룹·축)는 각오한 저장이다 — 불러오면 (지워짐) 표시와 3치가 받아낸다.
 */
export interface SavedFunnel {
    id: string;
    name: string;
    stages: FilterStage[];
}
const loadSets = (): SavedFunnel[] => {
    const arr = loadJson(SETS_KEY, (o) => (Array.isArray(o) ? o : null)) ?? [];
    const out: SavedFunnel[] = [];
    for (const raw of arr) {
        const f = raw as { id?: unknown; name?: unknown; stages?: unknown };
        if (typeof f?.id !== "string" || typeof f?.name !== "string") continue;
        const stages = parseStages(f.stages);
        if (stages) out.push({ id: f.id, name: f.name, stages });
    }
    return out;
};

/**
 * 깔때기에서 지금 짚은 칸들 — 한 단계 안에서 여러 칸(생존+근접 탈락…)을 겹쳐 볼 수 있다.
 * null = 아무것도 안 짚음 → 소비자들은 **최종 생존**을 본다(깔때기가 곧 네비게이션).
 * 조건이 아니라 **시선**이라 영속하지 않는다 — 새로고침 후 "왜 이것만 보이지"의 원인이 되면 안 된다.
 */
export interface FunnelSelection {
    stageId: string;
    cells: FunnelCell[];
}

export interface FilterFunnelSlice {
    /** 활성 슬롯의 단계 리스트 — 소비자(깔때기·보드)는 슬롯을 모르고 이것만 본다. */
    filterStages: FilterStage[];
    /** 슬롯 3벌(활성 칸은 filterStages 와 같은 참조). 이름 없는 고정 칸 — 잠깐 딴 조합을 보는 작업면. */
    filterSlots: FilterStage[][];
    filterSlotIndex: number;
    /** 슬롯 전환 — 조건 통째 교체라 시선(선택 칸)은 푼다(불러오기와 같은 이유). */
    setFilterSlot: (i: number) => void;
    /**
     * 결과를 타점까지 펼칠까 — **자동 해상도가 하루일 때만** 뜻이 있다(이미 타점이면 더 내려갈 데가 없다).
     * 위로 올리는 손잡이는 없다: 롤업 규칙이 정의되지 않아서다(stage.displayGrain 주석 참고).
     */
    filterExpandToPoints: boolean;
    /** 짚은 칸(시선) — 세션 한정. 골격·시트 등 구독자가 보는 집합을 정한다. */
    funnelSelection: FunnelSelection | null;
    addFilterStage: (predicates?: FilterPredicate[]) => void;
    /**
     * 보드에서 레일을 그은 결과 — 그 레일의 필터를 만들거나 갈아끼우거나(술어) 지운다(null).
     * 규칙은 stageBinding(순수)에 있고 여기서는 영속과 시선 정리만 한다.
     */
    applyFilterRail: (key: RailKey, predicate: FilterPredicate | null) => void;
    removeFilterStage: (id: string) => void;
    toggleFilterStage: (id: string) => void;
    moveFilterStage: (from: number, to: number) => void;
    setFilterStagePredicates: (id: string, predicates: FilterPredicate[]) => void;
    renameFilterStage: (id: string, name: string) => void;
    clearFilterStages: () => void;
    setFilterExpandToPoints: (on: boolean) => void;
    setFunnelSelection: (sel: FunnelSelection | null) => void;
    /** 저장한 깔때기들(영속). 불러오기 = 단계 리스트 통째 교체(시선은 푼다 — 다른 깔때기의 칸이라서). */
    savedFunnels: SavedFunnel[];
    saveFunnelSet: (name: string) => void;
    applyFunnelSet: (id: string) => void;
    deleteFunnelSet: (id: string) => void;
}

/** 단계는 손으로 쌓는 것이라 매 편집이 곧 영속 — 새로고침에 조건이 날아가면 깔때기를 다시 짜야 한다.
 *  편집은 언제나 **활성 슬롯에** 쓴다(filterStages 와 슬롯 배열이 같은 것을 가리키게 함께 갱신).
 *
 *  시선(funnelSelection)은 **활성 단계에만 성립**하므로 여기서 함께 정리한다 — 편집으로 그 단계가
 *  삭제되거나 비워지거나 꺼지면 시선을 푼다. 경로마다 따로 풀던 옛 방식은 "술어를 전부 비우는" 경로를
 *  빠뜨려, 칸은 사라졌는데 isFiltering 만 참으로 남는 스테일이 있었다. */
const put = (
    s: { filterSlots: FilterStage[][]; filterSlotIndex: number; funnelSelection: FunnelSelection | null },
    stages: FilterStage[],
): Pick<FilterFunnelSlice, "filterStages" | "filterSlots" | "funnelSelection"> => {
    const slots = s.filterSlots.map((x, i) => (i === s.filterSlotIndex ? stages : x));
    saveSlots(s.filterSlotIndex, slots);
    const sel = s.funnelSelection;
    const keep = sel !== null && activeStages(stages).some((st) => st.id === sel.stageId);
    return { filterStages: stages, filterSlots: slots, funnelSelection: keep ? sel : null };
};

const initialSlots = loadSlots();

export const createFilterFunnelSlice: StateCreator<WorkbenchState, [], [], FilterFunnelSlice> = (set) => ({
    filterStages: initialSlots.slots[initialSlots.active],
    filterSlots: initialSlots.slots,
    filterSlotIndex: initialSlots.active,
    filterExpandToPoints: loadExpand(),
    funnelSelection: null,

    setFilterSlot: (i) => set((s) => {
        if (i === s.filterSlotIndex || i < 0 || i >= FILTER_SLOT_COUNT) return {};
        saveSlots(i, s.filterSlots);
        return { filterSlotIndex: i, filterStages: s.filterSlots[i], funnelSelection: null };
    }),

    // 시선 정리는 전부 put 이 한다 — 삭제·비우기·끄기·레일 해제 어느 경로든 같은 규칙으로 풀린다.
    addFilterStage: (predicates) => set((s) => put(s, addStage(s.filterStages, predicates ?? []))),
    applyFilterRail: (key, predicate) => set((s) => put(s, applyRailPredicate(s.filterStages, key, predicate))),
    removeFilterStage: (id) => set((s) => put(s, removeStage(s.filterStages, id))),
    toggleFilterStage: (id) => set((s) => put(s, toggleStage(s.filterStages, id))),
    moveFilterStage: (from, to) => set((s) => put(s, moveStage(s.filterStages, from, to))),
    setFilterStagePredicates: (id, predicates) => set((s) => put(s, setStagePredicates(s.filterStages, id, predicates))),
    renameFilterStage: (id, name) => set((s) => put(s, renameStage(s.filterStages, id, name))),
    clearFilterStages: () => set((s) => put(s, [])),
    setFilterExpandToPoints: (on) => {
        saveJson(EXPAND_KEY, on);
        set(() => ({ filterExpandToPoints: on }));
    },
    setFunnelSelection: (sel) => set(() => ({ funnelSelection: sel })),

    savedFunnels: loadSets(),
    saveFunnelSet: (name) => set((s) => {
        const next = [...s.savedFunnels, { id: `fs${Date.now().toString(36)}`, name, stages: s.filterStages }];
        saveJson(SETS_KEY, next);
        return { savedFunnels: next };
    }),
    applyFunnelSet: (id) => set((s) => {
        const f = s.savedFunnels.find((x) => x.id === id);
        if (!f) return {};
        return { ...put(s, f.stages), funnelSelection: null };
    }),
    deleteFunnelSet: (id) => set((s) => {
        const next = s.savedFunnels.filter((x) => x.id !== id);
        saveJson(SETS_KEY, next);
        return { savedFunnels: next };
    }),
});
