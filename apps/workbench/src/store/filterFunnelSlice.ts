// 편집 중인 집합의 **조건 한 벌**과 시선(월·존재 필터)을 든 슬라이스.
//
// ⚠ 조건이 사는 자리는 **저장 집합**이다(2026-09-20) — 여긴 독립 저장물을 안 든다.
// `selectFilterExpr` 이 "편집 중인 집합의 식"을 파생하고, 모든 편집이 `putExpr` 하나를 지나 그 집합에
// 곧바로 쓴다(편집 = 저장). 저장 집합 슬라이스와의 접점은 그 함수 하나다.
//
// 시선(월·존재 필터)은 조건이 아니라 **보는 범위**라 집합에 안 들어간다 — 여기 남는 이유가 그것이다.

import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import type { SetRef } from "../lib/setRef.js";
import {
    newStage, renameGroupInStages,
    type FilterPredicate, type FilterStage,
} from "../panels/filter/stage.js";
import {
    appendLeaf, emptyExpr, filterLeaves, leavesOf, mapLeaves, type SetExpr,
} from "../panels/filter/expr.js";

import { applyRailToExpr, type RailKey } from "../panels/filter/stageBinding.js";
import { effectiveUniverse, universeOfExpr, type Universe } from "../panels/filter/universe.js";
import { persistSavedSets, refUniverse, type SavedSet } from "./savedSetsSlice.js";
import { loadJson, saveJson } from "./persist.js";
import { parsePresenceDnf, type PresenceDnf } from "../lib/presence.js";

/** 작업셋 로컬 시절의 키를 승계 — 옛 절-하나 형식도 parsePresenceDnf 가 [절] 로 읽는다. */
const GAZE_PRESENCE_KEY = "wb.workset.presenceFilter.v2"; // v2: 골격 존재 리터럴 리셋

/**
 * 작업면의 모드 — **영속**이다. 세션으로 두면 새로고침마다 종단으로 떨어져 하루 작업 국면이 매번
 * 끊긴다. 2026-09-19 가 기각한 것은 "우주를 **집합의** 저장 필드로 되돌리기"(`wb.filterUniverse`·
 * `setFilterUniverse`·`⧉ 복제`)이고, 이건 화면 상태의 영속이라 다른 물건이다.
 */
const FILTER_MODE_KEY = "wb.filterMode.v1";

/**
 * v2: **묶음이 곧 집합**(2026-09-20 — 식 1층화). 옛 키(v1·`wb.filterStages.*`·슬롯)는 **안 읽는다**.
 * 승계를 안 만든 근거와 대가는 `savedSetsSlice` 의 `SAVED_SETS_KEY` 주석에 한 곳으로 적어 뒀다.
 */


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


/** 편집·관측 대상을 푸는 데 필요한 것 — 셀렉터들이 공유하는 최소 조각. */
export type EditingCtx = { editingSetId: string; editPath: readonly string[]; savedSets: readonly SavedSet[] };

/**
 * ## 편집 대상과 관측 대상은 **다른 것**이다 (2026-09-21)
 *
 * · **편집**(`editingSetId`) = 지금 손이 닿는 집합. 드릴다운으로 내려가면 여기가 바뀐다.
 * · **관측**(`editPath[0]`) = 구독 패널(시트·차트·시뮬·작업 대상)이 **보는** 집합. 경로의 **뿌리**다.
 *
 * ⚠ 둘을 한 셀렉터로 겸하면 **내려갈 때마다 전 모수가 재정산된다** — 빈 묶음으로 내려가는 순간
 * 필터가 0(= 제한 없음)이 되어 종단 전량이 하류로 쏟아지고 화면이 먹통이 된다(2026-09-21 실사용).
 * 화면 규칙("내려가도 지도는 안 바뀐다")을 평가만 안 지키고 있던 자리다.
 */
const exprOfSet = (s: EditingCtx, id: string | undefined): SetExpr =>
    s.savedSets.find((x) => x.id === id)?.expr ?? EMPTY_EXPR;

/** 손이 닿는 집합의 식 — **쓰기 손과 그 거울**이 이걸 읽는다(주소가 갈리면 편집이 안 먹는다). */
export const selectEditingExpr = (s: EditingCtx): SetExpr => exprOfSet(s, s.editingSetId);

/** 구독 패널이 **보는** 집합의 식 — 경로의 뿌리. 경로가 비었으면 편집 대상이 곧 뿌리다. */
export const selectObservedExpr = (s: EditingCtx): SetExpr => exprOfSet(s, s.editPath[0] ?? s.editingSetId);

/** 파생이 빈 식을 낼 때 **같은 객체**를 준다 — 셀렉터 얕은 비교가 매번 깨지지 않게. */
const EMPTY_EXPR = emptyExpr();

export interface FilterFunnelSlice {

    /**
     * 선택 포인터 — 집합 편성 패널 안의 **단 하나의 선택**. null = 작업 깔때기(최종 생존),
     * 참조 = 집합 칩에서 고른 것. 연동 패널과 레일 오버레이가 전부 이 하나를 본다.
     * 시선이지 조건이 아니라 영속하지 않고, **깔때기를 만지는 순간 작업 깔때기로 복귀**한다(사용자 확정).
     */
    selectedSetRef: SetRef | null;
    selectSet: (ref: SetRef | null) => void;
    /**
     * **작업면의 모드** — 종단/하루 중 지금 무엇을 하러 왔나(2026-09-21 사람이 고른다).
     *
     * ⚠ 집합의 `universe`(조건에서 **파생**)와 다른 물건이다. 파생은 집합의 성질이고(참조 해결·핀·
     * `refUniverse` 가 쓴다), 이건 작업면의 상태다. 모드가 있으면 **팔레트가 처음부터 갈려**
     * "첫 조건이 말없이 우주를 정하는" 일이 없어진다(2026-09-21 실사용이 잡은 자리).
     */
    filterMode: Universe;
    setFilterMode: (u: Universe) => void;
    /**
     * **마지막으로 「계산」을 누른 순간의 저장물 한 벌** — 하루 우주의 평가는 이것만 본다(2026-09-21).
     *
     * `null` = 아직 한 번도 안 눌렀다(재료를 안 당긴다 — 부팅에 `/day-replay` 15MB 를 안 받는다).
     *
     * ⚠ **세대 번호가 아니라 스냅샷이어야 한다.** 번호로 두고 소비자마다 제 값을 잡으면 ① 나중에
     * 마운트한 패널이 **새 조건**을 잡아 누른 적 없는 평가가 한 번 더 돌고, ② 그 패널만 다른 수를
     * 낸다. 스냅샷이면 언제 마운트해도 같은 것을 본다.
     *
     * ⚠ **영속하지 않는다** — 새 세션은 "아직 계산 안 함"에서 시작하는 것이 이 모델의 뜻이다.
     * 저장은 즉시고(편집 = 저장) 늦는 것은 평가뿐이라, 커밋 버튼의 부활이 아니다.
     */
    evalSets: readonly SavedSet[] | null;
    computeNow: () => void;
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
    applyFilterRail: (key: RailKey, predicate: FilterPredicate | null, stageId?: string | null) => void;
    /**
     * 식 통째 교체 — 노드 편집(부정·연산자 토글·묶음 삭제)이 이 하나를 지난다.
     * 순수 규칙은 `expr.ts` 가 들고, 여기는 영속과 포인터 복귀만 한다(putExpr 와 같은 계약).
     */
    setFilterExpr: (expr: SetExpr) => void;
    /** 조건 하나 삭제 — 주소는 조건 id. */
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
export const selectEditingStages = (s: EditingCtx): FilterStage[] => leavesOf(selectEditingExpr(s));

/** 관측 집합의 조건 한 벌 — 축 목록·열 목록처럼 **화면이 보는 것과 맞아야** 하는 소비자가 쓴다. */
export const selectObservedStages = (s: EditingCtx): FilterStage[] => leavesOf(selectObservedExpr(s));

/**
 * **저장 집합 전부**의 조건 — 축 발급·유령 청소의 **보호 목록**이 쓴다.
 *
 * ⚠ 여기를 "지금 보는 집합"으로 좁히면 안 된다: 묶음으로 내려가 만든 조건의 축 키(`c:hot:<id>`·
 * 결과 열 `out:i:<id>`)가 유령으로 잡혀 **영구 삭제**된다(`useSheetColumns` 의 생사 기준과 한 규칙).
 * ⚠ **셀렉터로 쓰지 말 것** — 매번 새 배열이라 얕은 비교가 깨져 스토어의 모든 갱신이 그 소비자를
 * 깨운다. `savedSets`(안정된 참조)를 받아 `useMemo` 안에서 부른다.
 */
export const allStagesOf = (savedSets: readonly SavedSet[]): FilterStage[] => savedSets.flatMap((f) => leavesOf(f.expr));

/**
 * 조건이 사는 **우주** — 2026-09-19 부터 **파생**이다(저장 필드도 토글도 없다).
 * null = 아직 안 정해짐(중립 조건뿐이거나 조건 0개). 평가·표시는 effectiveUniverse 로 확정한다.
 */
export const selectEditingUniverse = (s: EditingCtx): Universe | null =>
    universeOfExpr(selectEditingExpr(s), refUniverse(s.savedSets));

/** 하류 라우팅(하루/종단)이 보는 우주 — **관측 집합**의 것이다. */
export const selectObservedUniverse = (s: EditingCtx): Universe | null =>
    universeOfExpr(selectObservedExpr(s), refUniverse(s.savedSets));

/** 「계산」을 누른 순간의 관측 식 — 하루 평가가 보는 유일한 식. null = 아직 안 눌렀다. */
export const selectEvalExpr = (s: EvalCtx): SetExpr | null =>
    s.evalSets === null ? null : (s.evalSets.find((x) => x.id === (s.editPath[0] ?? s.editingSetId))?.expr ?? EMPTY_EXPR);

/**
 * 계산 뒤 저장물이 바뀌었나 — 화면의 「낡음」이 이 한 비트다.
 * ⚠ 한 번도 안 눌렀으면 **낡은 게 아니라 아직 안 센 것**이다(둘을 합치면 화면이 거짓말한다).
 */
export const selectEvalStale = (s: EvalCtx): boolean => s.evalSets !== null && s.evalSets !== s.savedSets;

/** 평가 맥락을 푸는 데 필요한 것. */
export type EvalCtx = EditingCtx & { evalSets: readonly SavedSet[] | null };

/**
 * **편집이 곧 저장이다**(2026-09-20) — 「저장 안 한 변경」이라는 상태가 없다.
 *
 * 편집 대상은 **집합 하나**(`editingSetId`)이고, 모든 편집 손이 이 함수를 지나 그 집합의 식을
 * 갈아 끼운다. 옛 모델의 "작업 깔때기"(독립 저장물)는 없어졌다 — 집합이 곧 그 자리다.
 *
 * ⚠ 구독 패널이 한 글자마다 재평가되는 대가는 **평가 쪽 디바운스**가 받는다(useFilterFunnel),
 * 저장은 즉시다. 편집 버퍼 + 커밋은 기각 — 없애기로 한 개념이 이름만 바꿔 돌아온다(decisions).
 */
export const putExpr = (s: EditingCtx, expr: SetExpr): Pick<FilterFunnelSlice, "selectedSetRef"> & { savedSets: SavedSet[] } => {
    // 편집 대상이 목록에 없으면 **그 id 로 만든다** — "편집할 집합은 늘 하나 있다"는 불변식을 쓰기
    // 경로에서도 지킨다(조용히 버리면 손이 먹히고, 사용자는 왜 안 되는지 알 길이 없다).
    const has = s.savedSets.some((x) => x.id === s.editingSetId);
    const next = has
        ? s.savedSets.map((x) => (x.id === s.editingSetId ? { ...x, expr } : x))
        : [...s.savedSets, { id: s.editingSetId, expr, universe: "longitudinal" as const }];
    // 우주는 여기서 안 굳힌다 — `persistSavedSets` 의 재조정이 파생 규칙 한 곳에서 맡는다.
    const savedSets = persistSavedSets(next);
    // 조건을 만졌다 = 선택 포인터는 **편집 중인 집합**으로 복귀(= survivors). 칩에서 딴 집합을 보던
    // 중이라도, 조건을 고치는 손은 "지금 이걸 보겠다"는 뜻이다(편집의 대가가 화면에 보여야 한다).
    return { savedSets, selectedSetRef: null };
};

export const createFilterFunnelSlice: StateCreator<WorkbenchState, [], [], FilterFunnelSlice> = (set) => {
    return {
    selectedSetRef: null,
    gazeMonths: null, // 기본 = 전체(2026-08-22 사용자 확정 — 목록은 가상화라 전 모수가 상한이 아니다)
    gazePresence: loadJson(GAZE_PRESENCE_KEY, parsePresenceDnf) ?? [],
    filterMode: loadJson(FILTER_MODE_KEY, (o) => (o === "daily" || o === "longitudinal" ? o : null)) ?? "longitudinal",
    setFilterMode: (u) => set(() => { saveJson(FILTER_MODE_KEY, u); return { filterMode: u }; }),
    evalSets: null,
    computeNow: () => set((s) => ({ evalSets: s.savedSets })),

    // 포인터는 **우주를 넘지 않는다**(단계 ② 불변식 ①) — 넘게 두면 "하루 집합을 골랐더니 종단
    // 구독 패널이 전부 비는" 사고가 열린다. 전역 포인터를 우주별로 둘 두는 안은 과설계라 기각.
    selectSet: (ref) => set((s) => {
        if (ref?.kind === "saved") {
            const set = s.savedSets.find((x) => x.id === ref.setId);
            // 포인터는 우주를 안 넘는다(불변식 ①) — 양쪽 다 **파생값**으로 잰다.
            const here = effectiveUniverse(universeOfExpr(selectEditingExpr(s), refUniverse(s.savedSets)));
            if (set && effectiveUniverse(universeOfExpr(set.expr, refUniverse(s.savedSets))) !== here) return {};
        }
        return { selectedSetRef: ref };
    }),
    setGazeMonths: (months) => set(() => ({ gazeMonths: months })),
    setGazePresence: (dnf) => set(() => { saveJson(GAZE_PRESENCE_KEY, dnf); return { gazePresence: dnf }; }),

    // ⚠ 쓰기 API 의 **주소는 조건 id**(= `stage.id`)다 — 시그니처가 안 바뀌어 소비자가 그대로다.
    //   바뀐 건 쓰는 자리뿐: 독립 저장물 → **편집 중인 집합의 식**(putExpr 이 그 한 곳).
    addFilterStage: (predicates) => set((s) => putExpr(s, appendLeaf(selectEditingExpr(s), newStage(predicates ?? [])))),
    setFilterExpr: (expr) => set((s) => putExpr(s, expr)),
    applyFilterRail: (key, predicate, stageId) => set((s) => putExpr(s, applyRailToExpr(selectEditingExpr(s), key, predicate, stageId))),
    removeFilterStage: (id) => set((s) => putExpr(s, filterLeaves(selectEditingExpr(s), (x) => x.id !== id))),
    toggleFilterStage: (id) => set((s) => putExpr(s, mapLeaves(selectEditingExpr(s), (x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)))),
    setFilterStagePredicates: (id, predicates) => set((s) => putExpr(s, mapLeaves(selectEditingExpr(s), (x) => (x.id === id ? { ...x, predicates } : x)))),
    setFilterStage: (next) => set((s) => putExpr(s, mapLeaves(selectEditingExpr(s), (x) => (x.id === next.id ? next : x)))),
    renameFilterStage: (id, name) => set((s) => putExpr(s, mapLeaves(selectEditingExpr(s), (x) => {
        if (x.id !== id) return x;
        const n = name.trim();
        // 빈 이름 = 자동 라벨로 되돌리기(옛 renameStage 의 규칙 그대로 — 필드를 지운다).
        if (n === "") { const { name: _drop, ...rest } = x; return rest; }
        return { ...x, name: n };
    }))),
    renameGroupInFilters: (from, to) => set((s) => {
        // 기계 승계 — 편집 중인 집합만이 아니라 **저장 집합 전부**를 훑는다(그룹 이름이 리터럴이라).
        // putExpr 을 안 타는 이유: 손 편집이 아니라 기계 승계라 선택 포인터를 건드리면 안 된다.
        const sets = s.savedSets.map((f) => {
            const ex = mapLeaves(f.expr, (x) => renameGroupInStages([x], from, to)[0]!);
            return ex === f.expr ? f : { ...f, expr: ex };
        });
        if (!sets.some((f, i2) => f !== s.savedSets[i2])) return {};
        return { savedSets: persistSavedSets(sets) };
    }),
    clearFilterStages: () => set((s) => putExpr(s, emptyExpr())),
    };
};
