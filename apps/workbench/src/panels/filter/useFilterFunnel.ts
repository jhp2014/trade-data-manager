// 깔때기 배선 — **평가의 박자**(늦은 식·저장물)와 이름 사전을 한 자리에서 낸다.
//
// 2026-09-26 종단 폐기: 옛 종단 정산(유니버스 전개 → 3치 판정 → 정산)·리졸버(resolveSet)·뷰
// (useSetViews)는 전부 은퇴했다 — 하루 평가(useCellSet)가 유일한 평가기다. 이 훅이 남는 이유는
// **박자 하나**다: 편집은 즉시 저장되고, 평가(하루 우주 0.25~0.47초 + /day-replay 13MB)만 손을
// 멈춘 뒤 따라온다. 하루 소비자 전부(조건판 수·작업 대상·차트 ◇·탐색판)가 같은 늦은 한 벌을 봐야
// 수가 안 갈린다.
import { useMemo } from "react";
import { useGroups } from "../../lib/GroupsContext.js";
import { selectObservedExpr, useWorkbench } from "../../store/workbench.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { useDebounced, EVAL_DEBOUNCE_MS } from "../../lib/useDebounced.js";
import { leavesOf, type SetExpr } from "./expr.js";
import type { LabelLookup } from "./label.js";
import { isPredicateDead, type GrainLookup } from "./stage.js";

export interface FunnelView {
    /** 사전(그룹)이 오기 전 — 이때 이름·판정을 읽으면 안 된다. */
    isLoading: boolean;
    /** 죽은 참조(지워진 그룹)를 든 단계 id — 화면이 표시하고, 정리는 사용자가 결정한다. */
    deadStageIds: string[];
    /** 이름 조회 — 깔때기가 이미 사전을 들고 있으니 라벨을 만드는 자리마다 다시 조립하지 않게. */
    labelLook: LabelLookup;
    /**
     * **평가가 보는 늦은 식과 저장물** — 하루 평가(useCellSet) 소비자 전부가 이 한 벌을 쓴다.
     * 소비자가 제 디바운스를 따로 걸면 두 화면의 수가 서로 다른 순간의 조건에서 나온다.
     */
    slowExpr: SetExpr;
    slowSets: readonly SavedSet[];
}

/** ⚠ 직접 부르지 말 것 — FunnelProvider 가 유일한 호출자다(소비는 useFunnel). */
export function useFilterFunnel(): FunnelView {
    const freshExpr = useWorkbench(selectObservedExpr);
    const freshSavedSets = useWorkbench((s) => s.savedSets);
    /**
     * ⚠ **한 타이머로 묶는다** — 식과 저장물을 각자 디바운스하면 타이머가 둘이라 한 렌더 어긋나고,
     * 그 한 프레임 동안 **새 식 × 옛 저장물**로 참조가 풀린다(둘 다 "평가 맥락"이라 한 벌이어야 한다).
     */
    const slow = useDebounced(
        useMemo(() => ({ expr: freshExpr, sets: freshSavedSets }), [freshExpr, freshSavedSets]),
        EVAL_DEBOUNCE_MS,
    );

    const gv = useGroups();
    const isLoading = gv.isLoading;

    const grainLook = useMemo<GrainLookup>(
        () => ({ hasGroup: (id) => gv.groupByName.has(id), axisScope: () => undefined }),
        [gv.groupByName],
    );

    const stages = useMemo(() => leavesOf(slow.expr), [slow.expr]);
    const deadStageIds = useMemo(
        () => (isLoading ? [] : stages.filter((s) => s.predicates.some((p) => isPredicateDead(p, grainLook))).map((s) => s.id)),
        [isLoading, stages, grainLook],
    );

    const labelLook = useMemo<LabelLookup>(
        () => ({
            groupName: (id) => gv.groupByName.get(id)?.name,
            // 계산 축은 2026-09-26 종단 폐기로 은퇴 — 옛 축 조건은 ①-3 이주가 걷는다(그때 이 필드도 죽는다).
            axisName: () => undefined,
        }),
        [gv.groupByName],
    );

    return useMemo<FunnelView>(
        () => ({ isLoading, deadStageIds, labelLook, slowExpr: slow.expr, slowSets: slow.sets }),
        [isLoading, deadStageIds, labelLook, slow],
    );
}
