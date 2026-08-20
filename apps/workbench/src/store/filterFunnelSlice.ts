// 필터 깔때기 슬라이스 — **순서 있는 단계 리스트**. 조건이 사는 단 하나의 자리.
//
// 옛 rankFilterSlice 는 차원별로 자리가 정해진 평평한 가방이었다(밴드는 여기, 날짜는 저기…).
// 그 모양으로는 "단계 3개, 2번은 끄고, 1·3 순서 바꾸기"를 표현할 수 없다 — 차원이 곧 자리라서
// 순서라는 개념이 없다. 깔때기는 순서로 이야기를 만들므로(어느 단계가 무엇을 죽였나) 리스트여야 한다.
//
// 옛 저장 필터(wb.rankSavedFilters)는 변환하지 않는다 — 한 번 쓰고 버릴 변환 코드에 옛 형식 지식이
// 박히면 나중에 "이건 왜 있지"가 된다. 새 키로 시작하고 옛 키는 안 읽어서 자연히 죽게 둔다.
//
// 저장 집합(이름 붙인 산출물)은 savedSetsSlice 로 갈라져 있다 — 여기는 **작업 깔때기**(조건 한 벌·시선·
// 선택 포인터)만 산다. 두 슬라이스의 접점은 putStages 하나다(깔때기를 만지면 포인터가 복귀하는 규칙).
//
// ⚠ 조건 한 벌은 **하나**다. 한때 이름 없는 슬롯 3칸이 있었지만(A/B 비교용) 쓰이지 않았고, 그 역할은
// 저장 집합이 이미 한다 — 집합 = 이름 붙은 슬롯이고, 열기(openSet)가 곧 갈아타기다. 익명 칸이 사라져
// "지금 어느 칸이더라"를 물을 일도 없어졌다.
import type { StateCreator } from "zustand";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import type { WorkbenchState } from "./workbench.js";
import type { SetRef } from "../lib/setRef.js";
import {
    activeStages, addStage, moveStage, parseStages, removeStage, renameStage, setStagePredicates, toggleStage,
    type FilterPredicate, type FilterStage,
} from "../panels/filter/stage.js";
import { applyRailPredicate, type RailKey } from "../panels/filter/stageBinding.js";
import { loadJson, saveJson } from "./persist.js";
import { kstToday } from "../lib/date.js";
import { parsePresenceDnf, type PresenceDnf } from "../lib/presence.js";

/** 작업셋 로컬 시절의 키를 승계 — 옛 절-하나 형식도 parsePresenceDnf 가 [절] 로 읽는다. */
const GAZE_PRESENCE_KEY = "wb.workset.presenceFilter";

const STAGES_KEY = "wb.filterStages.v2"; // 지금 쓰는 단일 벌
const SLOTS_KEY = "wb.filterSlots"; // 슬롯 시절 — 활성 칸 하나만 이어받는다(나머지 칸은 버린다)
const LEGACY_STAGES_KEY = "wb.filterStages"; // 슬롯 이전의 단일 벌

/**
 * 조건 한 벌 읽기 — 지금 키 → 슬롯의 활성 칸 → 슬롯 이전의 단일 벌 순.
 * 슬롯의 **활성 칸만** 살린다: 나머지 두 칸은 이름이 없어 살려 둘 자리가 없고(집합은 이름이 있어야 한다),
 * 슬롯을 안 쓰던 사람에게는 애초에 빈 칸이다. 옛 키는 안 지운다 — 새 키가 서면 자연히 안 읽힌다.
 */
const loadStages = (): FilterStage[] => {
    const fresh = loadJson(STAGES_KEY, parseStages);
    if (fresh) return fresh;
    const slots = loadJson(SLOTS_KEY, (o) => (typeof o === "object" && o !== null ? (o as { active?: unknown; slots?: unknown }) : null));
    if (slots && Array.isArray(slots.slots)) {
        const at = typeof slots.active === "number" && Number.isInteger(slots.active) && slots.active >= 0 ? slots.active : 0;
        return parseStages((slots.slots as unknown[])[at]) ?? [];
    }
    return loadJson(LEGACY_STAGES_KEY, parseStages) ?? [];
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
    /** 조건 한 벌(영속). 읽기는 selectFilterStages 로 — 소비자가 필드 이름에 매이지 않게. */
    filterStages: FilterStage[];
    /** 짚은 칸(시선) — 세션 한정. 골격·시트 등 구독자가 보는 집합을 정한다. */
    funnelSelection: FunnelSelection | null;
    /**
     * 선택 포인터 — 집합 편성 패널 안의 **단 하나의 선택**. null = 작업 깔때기(짚은 칸 반영, 없으면 최종
     * 생존), 참조 = 집합 칩에서 고른 것. 연동 패널과 레일 오버레이가 전부 이 하나를 본다.
     * 시선이지 조건이 아니라 영속하지 않고, **깔때기를 만지는 순간 작업 깔때기로 복귀**한다(사용자 확정).
     */
    selectedSetRef: SetRef | null;
    selectSet: (ref: SetRef | null) => void;
    /**
     * 월 시선 — 전역 하나(작업셋 월 줄이 주인, 구독 패널은 viewOf 를 거쳐 자동으로 따른다). null = 전체.
     * 집합 포인터와 같은 성질(시선이지 조건이 아니다)이라 영속하지 않는다. 기본 = 오늘의 달(사용자 확정).
     */
    gazeMonths: string[] | null;
    setGazeMonths: (months: string[] | null) => void;
    /**
     * 존재(curation) 필터 시선 — 월과 함께 전역 시선의 세 번째 성분(보는 집합 = 집합 ∩ 월 ∩ 존재필터).
     * 주인은 작업셋 필터 줄. 월과 달리 **영속한다**(작업 국면은 재시작을 건너 살아야 한다 — 사용자 확정),
     * 키는 작업셋 로컬이던 시절 것을 그대로 승계(무손실).
     */
    gazePresence: PresenceDnf;
    setGazePresence: (dnf: PresenceDnf) => void;
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
    setFunnelSelection: (sel: FunnelSelection | null) => void;
}

/**
 * 조건 한 벌 읽기 — 소비자(깔때기·보드)는 이 선택자만 읽는다. 저장 모양이 바뀌어도(슬롯 3칸이었던
 * 시절처럼) 소비자는 안 바뀌라고 두는 자리다.
 */
export const selectFilterStages = (s: Pick<FilterFunnelSlice, "filterStages">): FilterStage[] => s.filterStages;

/** 단계는 손으로 쌓는 것이라 매 편집이 곧 영속 — 새로고침에 조건이 날아가면 깔때기를 다시 짜야 한다.
 *
 *  시선(funnelSelection)은 **활성 단계에만 성립**하므로 여기서 함께 정리한다 — 편집으로 그 단계가
 *  삭제되거나 비워지거나 꺼지면 시선을 푼다. 경로마다 따로 풀던 옛 방식은 "술어를 전부 비우는" 경로를
 *  빠뜨려, 칸은 사라졌는데 isFiltering 만 참으로 남는 스테일이 있었다.
 *
 *  export 인 이유: 저장 집합 열기(savedSetsSlice.openSet)도 "깔때기에 조건 한 벌을 쓰는 손"이라
 *  같은 규칙(영속·시선·포인터 정리)을 지나야 한다 — 두 슬라이스의 유일한 접점이다. */
export const putStages = (
    s: Pick<FilterFunnelSlice, "filterStages" | "funnelSelection">,
    stages: FilterStage[],
): Pick<FilterFunnelSlice, "filterStages" | "funnelSelection" | "selectedSetRef"> => {
    saveJson(STAGES_KEY, stages);
    const sel = s.funnelSelection;
    const keep = sel !== null && activeStages(stages).some((st) => st.id === sel.stageId);
    // 깔때기를 만졌다 = 선택 포인터는 작업 깔때기로 복귀 — 칩에서 고른 집합을 보던 중이라도, 조건을
    // 고치는 손은 "지금 이걸 보겠다"는 뜻이다(연동 패널이 편집을 따라와야 편집의 대가가 보인다).
    return { filterStages: stages, funnelSelection: keep ? sel : null, selectedSetRef: null };
};

export const createFilterFunnelSlice: StateCreator<WorkbenchState, [], [], FilterFunnelSlice> = (set) => ({
    filterStages: loadStages(),
    funnelSelection: null,
    selectedSetRef: null,
    gazeMonths: [kstToday().slice(0, 7)],
    gazePresence: loadJson(GAZE_PRESENCE_KEY, parsePresenceDnf) ?? [],

    selectSet: (ref) => set(() => ({ selectedSetRef: ref })),
    setGazeMonths: (months) => set(() => ({ gazeMonths: months })),
    setGazePresence: (dnf) => set(() => { saveJson(GAZE_PRESENCE_KEY, dnf); return { gazePresence: dnf }; }),

    // 시선 정리는 전부 putStages 가 한다 — 삭제·비우기·끄기·레일 해제 어느 경로든 같은 규칙으로 풀린다.
    addFilterStage: (predicates) => set((s) => putStages(s, addStage(selectFilterStages(s), predicates ?? []))),
    applyFilterRail: (key, predicate) => set((s) => putStages(s, applyRailPredicate(selectFilterStages(s), key, predicate))),
    removeFilterStage: (id) => set((s) => putStages(s, removeStage(selectFilterStages(s), id))),
    toggleFilterStage: (id) => set((s) => putStages(s, toggleStage(selectFilterStages(s), id))),
    moveFilterStage: (from, to) => set((s) => putStages(s, moveStage(selectFilterStages(s), from, to))),
    setFilterStagePredicates: (id, predicates) => set((s) => putStages(s, setStagePredicates(selectFilterStages(s), id, predicates))),
    renameFilterStage: (id, name) => set((s) => putStages(s, renameStage(selectFilterStages(s), id, name))),
    clearFilterStages: () => set((s) => putStages(s, [])),
    // 칸 짚기도 깔때기를 만지는 손이다 — 선택 포인터는 작업 깔때기로 복귀한다.
    setFunnelSelection: (sel) => set(() => ({ funnelSelection: sel, selectedSetRef: null })),
});
