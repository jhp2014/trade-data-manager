// 결과 조건의 연동 행 + **"지금 보는 허용 폭 T"** 의 단일 출처.
//
// T 가 정의(pointDef)에서 결과 술어로 내려가면서(2026-09-09) 화면에는 T 가 여러 개 존재할 수 있게
// 됐다 — 조건마다 자기 T 를 든다. 그런데 차트 다리 표식·3분류 카운트·조건 없을 때의 결과 열처럼
// **조건이 아닌 자리**도 기준이 하나 필요하다. 그 기준이 여기서 나온다:
//
//   표시 T = 연동 행의 T, 연동이 없으면 **탐색 T**(세션)
//
// 테마 순위 패널의 "행 0개면 순수 산점"과 같은 규칙이다. 연동 해석은 themeLink 의 코어를 그대로
// 쓴다(죽은 id → 다음 행) — 두 벌이면 그 규칙이 갈린다.
//
// ⚠ **T 를 읽는 자리는 이 모듈을 지난다.** `pointDef` 에서 T 필드가 사라진 것이 그 불변식의 기계적
// 강제고, 여기 말고 다른 곳에서 T 를 지어내면 화면마다 다른 기준이 서는 옛 사고로 되돌아간다.
import { useCallback, useMemo, useState } from "react";
import { TOLERANCE_MAX_PCT, TOLERANCE_MIN_PCT } from "@trade-data-manager/market/domain";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { useLinkedStageId } from "../filter/themeLink.js";
import { stageKind, type FilterStage } from "../filter/stage.js";

export const OUTCOME_LINK_SCOPE = "outcomeLink";
/** 탐색 T — 연동 행이 없을 때의 기준. 세션 수명(연동 포인터와 같은 갈림길: 새로고침 = 새 시작). */
export const OUTCOME_T_SCOPE = "outcomeT";
export const OUTCOME_T_KEY = "pct";

/** 결과 계열 행인가 — 지표 조건과 회복 조건 둘 다 자기 T 를 든다. */
export const isOutcomeStage = (s: FilterStage): boolean => {
    const k = stageKind(s);
    return k === "outcome" || k === "outcomeRecovery";
};

/** 그 행의 허용 폭 T — 결과 계열이 아니면 null. */
export function outcomeTOf(s: FilterStage): number | null {
    for (const p of s.predicates) if (p.kind === "outcome" || p.kind === "outcomeRecovery") return p.t;
    return null;
}

export interface LinkedOutcome {
    /** 보드 순서 그대로의 결과 계열 행들(칩 스트립의 목록). */
    outcomeStages: FilterStage[];
    /** 지금 연동된 행 id — null 은 명시적 해제(그때는 탐색 T 가 기준). */
    linkedId: string | null;
    setLinked: (id: string | null) => void;
    /** 지금 보는 허용 폭 T(%) — 연동 행의 T, 없으면 탐색 T. */
    displayT: number;
    /**
     * T 레일 커밋 — 연동 행이 있으면 **그 행의 T 를 옮기고**(조건의 기준이 바뀐다), 없으면 탐색 T 만 옮긴다.
     * 연동 행이 있을 때 탐색 T 도 같이 적어 둔다: 연동을 풀었을 때 화면이 튀지 않게.
     *
     * ⚠ **자리 충돌은 거절한다** — 레일 키가 (지표 × T) 라, 옮긴 자리에 같은 지표의 조건이 이미 있으면
     * 뒤 조건이 편집면에서 사라진 채 계속 필터링한다("이 레일에 뭘 그릴까"가 함수라는 근거가 그 한
     * 경로에서만 깨진다). 그때는 안 옮기고 `conflictAt` 으로 알린다 — 조용히 덮어쓰는 것보다 정직하다.
     */
    setDisplayT: (t: number) => void;
    /** 직전 setDisplayT 가 자리 충돌로 거절된 T(%) — 화면이 이유를 말할 재료. 성공하면 null. */
    conflictAt: number | null;
}

const clampT = (t: number): number => Math.min(TOLERANCE_MAX_PCT, Math.max(TOLERANCE_MIN_PCT, t));

export function useLinkedOutcome(): LinkedOutcome {
    const stages = useWorkbench(selectFilterStages);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const setSessionUi = useWorkbench((s) => s.setSessionUi);
    const [conflictAt, setConflictAt] = useState<number | null>(null);
    const exploreRaw = useWorkbench((s) => s.sessionUi[OUTCOME_T_SCOPE]?.[OUTCOME_T_KEY]);
    const exploreT = typeof exploreRaw === "number" ? clampT(exploreRaw) : TOLERANCE_MIN_PCT;

    const outcomeStages = useMemo(() => stages.filter(isOutcomeStage), [stages]);
    const curIds = useMemo(() => outcomeStages.map((s) => s.id), [outcomeStages]);
    const { linkedId, setLinked } = useLinkedStageId(OUTCOME_LINK_SCOPE, curIds);

    const linked = linkedId === null ? undefined : outcomeStages.find((s) => s.id === linkedId);
    const displayT = (linked && outcomeTOf(linked)) ?? exploreT;

    const setDisplayT = useCallback((t: number): void => {
        const next = clampT(t);
        if (!linked) {
            setConflictAt(null);
            setSessionUi(OUTCOME_T_SCOPE, OUTCOME_T_KEY, next);
            return;
        }
        // 자리 충돌 검사 — 옮긴 T 에 **같은 지표(또는 같은 회복 조건)** 가 이미 있으면 거절한다.
        const mine = linked.predicates.find((p) => p.kind === "outcome" || p.kind === "outcomeRecovery");
        const clash = mine !== undefined && outcomeStages.some((st) => st.id !== linked.id && st.predicates.some((p) => (
            p.kind === "outcome" && mine.kind === "outcome" ? p.metric === mine.metric && p.t === next
                : p.kind === "outcomeRecovery" && mine.kind === "outcomeRecovery" ? p.t === next
                    : false)));
        if (clash) {
            setConflictAt(next);
            return;
        }
        setConflictAt(null);
        setSessionUi(OUTCOME_T_SCOPE, OUTCOME_T_KEY, next);
        // 그 행의 모든 결과 술어가 같은 T 를 든다(행 하나 = 술어 하나라 실제로는 하나).
        setPredicates(linked.id, linked.predicates.map((p) => (p.kind === "outcome" || p.kind === "outcomeRecovery" ? { ...p, t: next } : p)));
    }, [linked, outcomeStages, setPredicates, setSessionUi]);

    return { outcomeStages, linkedId, setLinked, displayT, setDisplayT, conflictAt };
}

/**
 * "지금 보는 T" 만 필요한 소비자용(차트 다리 표식 등) — 연동 목록·커밋을 안 쓰는 자리가
 * 훅 하나로 끝나게. 값의 규칙은 위와 같은 한 곳이다.
 */
export const useDisplayT = (): number => useLinkedOutcome().displayT;
