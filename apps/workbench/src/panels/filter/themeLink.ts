// 연동 행 — 테마 조건의 **펼침 ≡ 연동** 상태 하나(세션 수명, sessionUi). 보드 테마 칸의 펼친 행과
// 테마 순위 패널이 비추는 행이 같은 id 를 본다(decisions.md "조건을 만드는 손은 편성 보드 하나").
//
// 왜 세션 수명인가: 연동은 "지금 보고 있는 행"이지 취향이 아니다 — 새로고침 = 새 시작이 정직하고,
// 프리셋 전환(패널 재마운트)에는 살아남아야 한다(sessionUiSlice 의 갈림길 그대로).
//
// 연동 행이 사라지는 경로는 보드 밖에도 있다(막대 목록 삭제·저장 집합 적용의 통째 교체) — 그래서
// "다음 행으로 자동 이동"은 삭제 핸들러가 아니라 **순수 해석기 + 훅의 관찰**로 푼다.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { stageKind, type FilterStage } from "./stage.js";
import type { ThemeStrengthParams } from "../../lib/themeStrength.js";

export const THEME_LINK_SCOPE = "themeLink";
export const THEME_LINK_KEY = "stageId";

/** 행의 테마 술어 params — 테마 행이 아니면 null. */
export function themeParamsOf(s: FilterStage): ThemeStrengthParams | null {
    const p = s.predicates.find((x) => x.kind === "themeStrength");
    return p && p.kind === "themeStrength" ? p.params : null;
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

export interface LinkedThemeStage {
    /** 보드 순서 그대로의 테마 행들. */
    themeStages: FilterStage[];
    /** 지금 연동(=펼침)된 행 id — null 은 명시적 접힘(패널은 순수 산점). */
    linkedId: string | null;
    setLinked: (id: string | null) => void;
}

/**
 * 연동 상태 훅 — 보드 테마 칸과 패널 둘 다 이걸 쓴다. 저장 id 가 죽으면 다음 행으로 옮겨 적는다
 * (두 소비자가 같이 떠 있어도 해석이 결정적이라 이중 기록은 같은 값 — 무해).
 * 처음(기록 없음)은 첫 행 자동 연동 — 행이 있는데 패널이 비어 있는 것보다 정직하다.
 */
export function useLinkedThemeStage(): LinkedThemeStage {
    const stages = useWorkbench(selectFilterStages);
    const themeStages = useMemo(() => stages.filter((s) => stageKind(s) === "themeStrength"), [stages]);
    const curIds = useMemo(() => themeStages.map((s) => s.id), [themeStages]);
    const stored = useWorkbench((s) => s.sessionUi[THEME_LINK_SCOPE]?.[THEME_LINK_KEY]) as string | null | undefined;
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
        if (typeof stored === "string" && !curIds.includes(stored)) setSessionUi(THEME_LINK_SCOPE, THEME_LINK_KEY, linkedId);
    }, [stored, curIds, linkedId, setSessionUi]);

    const setLinked = useCallback((id: string | null) => setSessionUi(THEME_LINK_SCOPE, THEME_LINK_KEY, id), [setSessionUi]);
    return { themeStages, linkedId, setLinked };
}
