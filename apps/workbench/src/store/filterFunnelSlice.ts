// 필터 깔때기 슬라이스 — **순서 있는 단계 리스트**. 조건이 사는 단 하나의 자리.
//
// 옛 rankFilterSlice 는 차원별로 자리가 정해진 평평한 가방이었다(밴드는 여기, 날짜는 저기…).
// 그 모양으로는 "단계 3개, 2번은 끄고, 하나 더 추가"를 표현할 수 없다 — 차원이 곧 자리라서 개수가
// 고정된다. 조건은 손으로 쌓고 지우는 것이라 리스트여야 한다.
//
// 옛 저장 필터(wb.rankSavedFilters)는 변환하지 않는다 — 한 번 쓰고 버릴 변환 코드에 옛 형식 지식이
// 박히면 나중에 "이건 왜 있지"가 된다. 새 키로 시작하고 옛 키는 안 읽어서 자연히 죽게 둔다.
//
// 저장 집합(이름 붙인 산출물)은 savedSetsSlice 로 갈라져 있다 — 여기는 **작업 깔때기**(조건 한 벌·
// 선택 포인터)만 산다. 두 슬라이스의 접점은 putStages 하나다(깔때기를 만지면 포인터가 복귀하는 규칙).
//
// ⚠ 조건 한 벌은 **하나**다. 한때 이름 없는 슬롯 3칸이 있었지만(A/B 비교용) 쓰이지 않았고, 그 역할은
// 저장 집합이 이미 한다 — 집합 = 이름 붙은 슬롯이고, 열기(openSet)가 곧 갈아타기다. 익명 칸이 사라져
// "지금 어느 칸이더라"를 물을 일도 없어졌다.
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import type { SetRef } from "../lib/setRef.js";
import {
    newStage, parseStages, renameGroupInStages,
    type FilterPredicate, type FilterStage,
} from "../panels/filter/stage.js";
import {
    addLeafAt, appendLeaf, emptyExpr, filterLeaves, leavesOf, mapLeaves, parseExpr, type SetExpr,
} from "../panels/filter/expr.js";

import { applyRailToExpr, type RailKey } from "../panels/filter/stageBinding.js";
import { effectiveUniverse, universeOfExpr, type Universe } from "../panels/filter/universe.js";
import { persistSavedSets, refUniverse, type SavedSet } from "./savedSetsSlice.js";
import { loadJson, saveJson } from "./persist.js";
import { parsePresenceDnf, type PresenceDnf } from "../lib/presence.js";

/** 작업셋 로컬 시절의 키를 승계 — 옛 절-하나 형식도 parsePresenceDnf 가 [절] 로 읽는다. */
const GAZE_PRESENCE_KEY = "wb.workset.presenceFilter.v2"; // v2: 골격 존재 리터럴 리셋

/**
 * v2: **묶음이 곧 집합**(2026-09-20 — 식 1층화). 옛 키(v1·`wb.filterStages.*`·슬롯)는 **안 읽는다**.
 * 승계를 안 만든 근거와 대가는 `savedSetsSlice` 의 `SAVED_SETS_KEY` 주석에 한 곳으로 적어 뒀다.
 */
const EXPR_KEY = "wb.filterExpr.v2";

// 옛 결과 술어엔 t 가 없고 그 기준(정의의 T1)은 복원할 수 없다 — 사용자 확정 "기존 저장물은 버린다"에 따라
// 승계 코드 없이 키를 올린다. parseStages 는 술어 하나만 못 읽어도 저장본 통째를 버리므로 부분 승계는 애초에 불가.


// (옛 `wb.filterUniverse` 스칼라 키는 2026-09-19 9단계로 **안 읽는다** — 우주가 조건에서 파생되므로
//  저장할 것이 없다. 키는 안 지운다: 새 코드가 안 읽으면 자연히 죽는다.)

/**
 * 식 읽기 — 새 키(식 트리) → 옛 평평한 리스트(`AND(잎…)` 로 승계).
 *
 * ⚠ 승계는 **무손실**이다(2026-09-19): 옛 리스트의 단계들이 그대로 루트 AND 의 잎이 되고,
 * **노드 id = 옛 `stage.id` 를 그대로 쓴다**. id 를 새로 뽑으면 시트 인스턴스 결과 열(`out:i:<id>`)·
 * 급타점 축(`c:hot:<id>`)·테마 연동(`wb.themeRankBindings.v1`)이 전부 주소를 잃고, 유령 청소가
 * 저장물 기준이라 열 폭·고정·숨김과 연동이 **첫 실행에 조용히 영구 삭제**된다.
 *
 * 옛 키는 안 지운다 — 새 키가 서면 자연히 안 읽힌다.
 */
const loadExpr = (): SetExpr => loadJson(EXPR_KEY, (o) => parseExpr(o, parseStages)) ?? emptyExpr();

export interface FilterFunnelSlice {
    /**
     * 작업 깔때기의 **식**(영속) — 2026-09-19 부터 리스트가 아니라 트리다.
     * 평평한 목록을 읽는 소비자는 `selectFilterStages`(= leavesOf 투영)를 그대로 쓴다.
     */
    filterExpr: SetExpr;

    /**
     * 선택 포인터 — 집합 편성 패널 안의 **단 하나의 선택**. null = 작업 깔때기(최종 생존),
     * 참조 = 집합 칩에서 고른 것. 연동 패널과 레일 오버레이가 전부 이 하나를 본다.
     * 시선이지 조건이 아니라 영속하지 않고, **깔때기를 만지는 순간 작업 깔때기로 복귀**한다(사용자 확정).
     */
    selectedSetRef: SetRef | null;
    selectSet: (ref: SetRef | null) => void;
    /**
     * 월 시선 — 전역 하나(작업셋 월 줄이 주인, 구독 패널은 viewOf 를 거쳐 자동으로 따른다). null = 전체.
     * 집합 포인터와 같은 성질(시선이지 조건이 아니다)이라 영속하지 않는다. 기본 = 전체(사용자 확정).
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
    applyFilterRail: (key: RailKey, predicate: FilterPredicate | null, at?: string | null, mode?: "and" | "or", stageId?: string | null) => void;
    /**
     * 식 통째 교체 — 노드 편집(부정·연산자 토글·묶음 삭제)이 이 하나를 지난다.
     * 순수 규칙은 `expr.ts` 가 들고, 여기는 영속과 포인터 복귀만 한다(putExpr 와 같은 계약).
     */
    setFilterExpr: (expr: SetExpr) => void;
    /**
     * 조건 붙이기 — **삽입 지점과 연산자**를 받는다(7단계). `at` 은 짚은 노드 id(없으면 루트),
     * `mode` 는 "AND 로 추가 / OR 로 추가" 두 버튼이 주는 값이다. 괄호는 이 규칙의 결과로 생긴다.
     */
    addFilterStageAt: (predicates: FilterPredicate[], at: string | null, mode: "and" | "or") => void;
    removeFilterStage: (id: string) => void;
    toggleFilterStage: (id: string) => void;
    setFilterStagePredicates: (id: string, predicates: FilterPredicate[]) => void;
    /** 칸 통째 교체 — 칸 수준 필드(전이)까지 한 번에 가는 편집면이 쓴다(셀 술어 인라인 편집). */
    setFilterStage: (next: FilterStage) => void;
    renameFilterStage: (id: string, name: string) => void;
    /**
     * 그룹 **개명 승계** — 그룹 필터 리터럴이 그룹을 이름으로 들고 있어, 서버 개명 후 여기서 작업 깔때기 +
     * 저장 집합(조건 사본)의 옛 이름을 따라 바꾼다. 안 하면 개명 즉시 그 이름을 쓰던 저장물이 죽은 참조가
     * 된다(@none:day 승계 규칙과 같은 성질). putStages 를 안 타는 이유: 이건 손 편집이 아니라 기계 승계라
     * 선택 포인터를 건드리면 안 된다(단계 id 불변).
     */
    renameGroupInFilters: (from: string, to: string) => void;
    clearFilterStages: () => void;
}

/**
 * 조건 한 벌 읽기 — 소비자(깔때기·보드)는 이 선택자만 읽는다. 저장 모양이 바뀌어도(슬롯 3칸이었던
 * 시절처럼) 소비자는 안 바뀌라고 두는 자리다.
 */
export const selectFilterStages = (s: Pick<FilterFunnelSlice, "filterExpr">): FilterStage[] => leavesOf(s.filterExpr);

/**
 * 지금 만지는 조건이 사는 **우주** — 2026-09-19 부터 **파생**이다(저장 필드도 토글도 없다).
 * null = 아직 안 정해짐(중립 조건뿐이거나 조건 0개). 평가·표시는 effectiveUniverse 로 확정한다.
 */
export const selectFilterUniverse = (s: Pick<FilterFunnelSlice, "filterExpr"> & { savedSets: readonly SavedSet[] }): Universe | null =>
    universeOfExpr(s.filterExpr, refUniverse(s.savedSets));

/** 단계는 손으로 쌓는 것이라 매 편집이 곧 영속 — 새로고침에 조건이 날아가면 깔때기를 다시 짜야 한다.
 *
 *  export 인 이유: 저장 집합 열기(savedSetsSlice.openSet)도 "깔때기에 조건 한 벌을 쓰는 손"이라
 *  같은 규칙(영속·포인터 정리)을 지나야 한다 — 두 슬라이스의 유일한 접점이다. */
export const putExpr = (
    expr: SetExpr,
): Pick<FilterFunnelSlice, "filterExpr" | "selectedSetRef"> => {
    saveJson(EXPR_KEY, expr);
    // 깔때기를 만졌다 = 선택 포인터는 작업 깔때기로 복귀 — 칩에서 고른 집합을 보던 중이라도, 조건을
    // 고치는 손은 "지금 이걸 보겠다"는 뜻이다(연동 패널이 편집을 따라와야 편집의 대가가 보인다).
    return {
        filterExpr: expr,
        selectedSetRef: null,
    };
};

export const createFilterFunnelSlice: StateCreator<WorkbenchState, [], [], FilterFunnelSlice> = (set) => {
    return {
    filterExpr: loadExpr(),
    selectedSetRef: null,
    gazeMonths: null, // 기본 = 전체(2026-08-22 사용자 확정 — 목록은 가상화라 전 모수가 상한이 아니다)
    gazePresence: loadJson(GAZE_PRESENCE_KEY, parsePresenceDnf) ?? [],

    // 포인터는 **우주를 넘지 않는다**(단계 ② 불변식 ①) — 넘게 두면 "하루 집합을 골랐더니 종단
    // 구독 패널이 전부 비는" 사고가 열린다. 전역 포인터를 우주별로 둘 두는 안은 과설계라 기각.
    selectSet: (ref) => set((s) => {
        if (ref?.kind === "saved") {
            const set = s.savedSets.find((x) => x.id === ref.setId);
            // 포인터는 우주를 안 넘는다(불변식 ①) — 양쪽 다 **파생값**으로 잰다.
            const here = effectiveUniverse(universeOfExpr(s.filterExpr, refUniverse(s.savedSets)));
            if (set && effectiveUniverse(universeOfExpr(set.expr, refUniverse(s.savedSets))) !== here) return {};
        }
        return { selectedSetRef: ref };
    }),
    setGazeMonths: (months) => set(() => ({ gazeMonths: months })),
    setGazePresence: (dnf) => set(() => { saveJson(GAZE_PRESENCE_KEY, dnf); return { gazePresence: dnf }; }),

    // ⚠ 쓰기 API 의 **주소는 여전히 노드 id**(= 옛 stage.id)다 — 시그니처가 안 바뀌어 소비자가 그대로다.
    //   바뀐 건 구현뿐: 리스트 편집 → 트리 편집(mapLeaves/filterLeaves/appendLeaf).
    addFilterStage: (predicates) => set((s) => putExpr(appendLeaf(s.filterExpr, newStage(predicates ?? [])))),
    addFilterStageAt: (predicates, at, mode) => set((s) => putExpr(addLeafAt(s.filterExpr, at, newStage(predicates), mode))),
    setFilterExpr: (expr) => set(() => putExpr(expr)),
    applyFilterRail: (key, predicate, at = null, mode = "and", stageId) => set((s) => putExpr(applyRailToExpr(s.filterExpr, key, predicate, at, mode, stageId))),
    removeFilterStage: (id) => set((s) => putExpr(filterLeaves(s.filterExpr, (x) => x.id !== id))),
    toggleFilterStage: (id) => set((s) => putExpr(mapLeaves(s.filterExpr, (x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)))),
    setFilterStagePredicates: (id, predicates) => set((s) => putExpr(mapLeaves(s.filterExpr, (x) => (x.id === id ? { ...x, predicates } : x)))),
    setFilterStage: (next) => set((s) => putExpr(mapLeaves(s.filterExpr, (x) => (x.id === next.id ? next : x)))),
    renameFilterStage: (id, name) => set((s) => putExpr(mapLeaves(s.filterExpr, (x) => {
        if (x.id !== id) return x;
        const n = name.trim();
        // 빈 이름 = 자동 라벨로 되돌리기(옛 renameStage 의 규칙 그대로 — 필드를 지운다).
        if (n === "") { const { name: _drop, ...rest } = x; return rest; }
        return { ...x, name: n };
    }))),
    renameGroupInFilters: (from, to) => set((s) => {
        const expr = mapLeaves(s.filterExpr, (x) => renameGroupInStages([x], from, to)[0]!);
        const sets = s.savedSets.map((f) => {
            const ex = mapLeaves(f.expr, (x) => renameGroupInStages([x], from, to)[0]!);
            return ex === f.expr ? f : { ...f, expr: ex };
        });
        const setsTouched = sets.some((f, i) => f !== s.savedSets[i]);
        if (expr !== s.filterExpr) saveJson(EXPR_KEY, expr);
        return {
            ...(expr !== s.filterExpr ? { filterExpr: expr } : {}),
            ...(setsTouched ? { savedSets: persistSavedSets(sets) } : {}),
        };
    }),
    clearFilterStages: () => set(() => putExpr(emptyExpr())),
    };
};
