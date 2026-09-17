// 연동 id 해석의 **범용 코어** — 세션 수명(sessionUi) "펼침 ≡ 연동" 관용구. hot(급타점)·outcome(결과)이
// 이 훅으로 제 연동을 든다. ⚠ **테마는 2026-09-17 부터 이 관용구를 안 쓴다** — 테마 행↔조건판은
// 영속 1:1 바인딩(store/themeBindingSlice, pull — 결정권은 보드)이고, 옛 useLinkedThemeStage 는 은퇴했다.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { stageKind, type FilterStage } from "./stage.js";
import { DEFAULT_THEME_STRENGTH, type ThemeStrengthParams } from "../../lib/themeStrength.js";

export const THEME_LINK_KEY = "stageId";

/** 행의 테마 술어 params — 테마 행이 아니면 null. */
export function themeParamsOf(s: FilterStage): ThemeStrengthParams | null {
    const p = s.predicates.find((x) => x.kind === "themeStrength");
    return p && p.kind === "themeStrength" ? p.params : null;
}

/**
 * "지금 화면이 따를 테마 노브" 한 벌 — 조건 행이 아닌 읽기 면(타점 정보·탐색 후보)이 존 순위를 셀 때의
 * 결정론 사다리: **바인딩된 행 중 보드 순서 첫 행** → 테마 행 첫 행 → 기본값. 화면마다 이 사다리를
 * 손으로 다시 쓰면 같은 존 순위가 두 숫자로 갈린다(2026-09-17 pull 연동 재편의 따름 규칙).
 */
export function useThemeKnobParams(): ThemeStrengthParams {
    const stages = useWorkbench(selectFilterStages);
    const bindings = useWorkbench((s) => s.themeBindings);
    return useMemo(() => {
        const themeStages = stages.filter((s) => stageKind(s) === "themeStrength");
        const first = themeStages.find((s) => bindings[s.id] !== undefined) ?? themeStages[0] ?? null;
        return (first ? themeParamsOf(first) : null) ?? DEFAULT_THEME_STRENGTH;
    }, [stages, bindings]);
}

/**
 * 저장된 연동 id 가 사라졌을 때 어디로 가나(순수) — 이전 목록에서 그 **다음** 생존자, 없으면 이전
 * 생존자, 둘 다 없으면(이전 목록을 모르면) 첫 행. 목록이 비면 null.
 */
export function nextLinkedId(prevIds: readonly string[], curIds: readonly string[], stored: string): string | null {
    if (curIds.includes(stored)) return stored;
    if (curIds.length === 0) return null;
    const i = prevIds.indexOf(stored);
    if (i >= 0) {
        for (let k = i + 1; k < prevIds.length; k++) if (curIds.includes(prevIds[k]!)) return prevIds[k]!;
        for (let k = i - 1; k >= 0; k--) if (curIds.includes(prevIds[k]!)) return prevIds[k]!;
    }
    return curIds[0]!;
}

/**
 * 연동 id 해석 코어(범용) — **테마와 결과가 같은 관용구를 쓴다**(두 벌이면 "죽은 id 는 다음 행으로"
 * 규칙이 갈린다). 저장 id 가 죽으면 다음 행으로 옮겨 적고, 기록이 없으면 첫 행을 자동 연동한다.
 */
export function useLinkedStageId(scope: string, curIds: readonly string[]): { linkedId: string | null; setLinked: (id: string | null) => void } {
    const stored = useWorkbench((s) => s.sessionUi[scope]?.[THEME_LINK_KEY]) as string | null | undefined;
    const setSessionUi = useWorkbench((s) => s.setSessionUi);

    // 이전 목록 — "다음 행" 판정의 재료. 해석(렌더) 뒤에 갱신해야 이번 해석이 직전 목록을 본다.
    const prevIdsRef = useRef<readonly string[]>(curIds);
    const linkedId = useMemo(() => {
        if (stored === null) return null; // 명시적 접힘
        if (stored === undefined) return curIds[0] ?? null; // 기록 없음 = 첫 행 자동 연동
        return nextLinkedId(prevIdsRef.current, curIds, stored);
    }, [stored, curIds]);
    useEffect(() => { prevIdsRef.current = curIds; }, [curIds]);

    // 죽은 id 는 옮겨 적는다 — 다음 삭제 때도 "직전에 보던 행" 기준으로 다음을 찾을 수 있게.
    useEffect(() => {
        if (typeof stored === "string" && !curIds.includes(stored)) setSessionUi(scope, THEME_LINK_KEY, linkedId);
    }, [scope, stored, curIds, linkedId, setSessionUi]);

    const setLinked = useCallback((id: string | null) => setSessionUi(scope, THEME_LINK_KEY, id), [scope, setSessionUi]);
    return { linkedId, setLinked };
}
