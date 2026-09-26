// 깔때기 배선 — **평가의 박자**(늦은 식·저장물)를 한 자리에서 낸다.
//
// 2026-09-26 종단 폐기: 옛 정산·리졸버·뷰에 이어 이름 사전(labelLook)·죽은 참조(deadStageIds)도
// 은퇴했다 — 남은 술어 종류는 이름 재료가 전부 payload 라 사전이 필요 없다. 이 훅이 남는 이유는
// **박자 하나**다: 편집은 즉시 저장되고, 평가(하루 우주 0.25~0.47초 + /day-replay 13MB)만 손을
// 멈춘 뒤 따라온다. 하루 소비자 전부(조건판 수·작업 대상·차트 ◇·탐색판)가 같은 늦은 한 벌을 봐야
// 수가 안 갈린다.
import { useMemo } from "react";
import { selectObservedExpr, useWorkbench } from "../../store/workbench.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { useDebounced, EVAL_DEBOUNCE_MS } from "../../lib/useDebounced.js";
import type { SetExpr } from "./expr.js";

export interface FunnelView {
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
    return useMemo<FunnelView>(() => ({ slowExpr: slow.expr, slowSets: slow.sets }), [slow]);
}
