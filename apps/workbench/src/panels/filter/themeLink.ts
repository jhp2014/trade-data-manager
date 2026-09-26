// 연동 id 해석의 **범용 코어** — 세션 수명(sessionUi) "펼침 ≡ 연동" 관용구. hot(급타점)·outcome(결과)이
// 이 훅으로 제 연동을 든다. ⚠ **테마는 2026-09-17 부터 이 관용구를 안 쓴다** — 테마 행↔조건판은
// 영속 1:1 바인딩(store/themeBindingSlice, pull — 결정권은 보드)이고, 옛 useLinkedThemeStage 는 은퇴했다.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { selectEditingStages, useWorkbench } from "../../store/workbench.js";

import { DEFAULT_THEME_ZONE, type ThemeZoneParams } from "@trade-data-manager/market/domain";

export const THEME_LINK_KEY = "stageId";

/**
 * "지금 보는 존 기준" 한 벌(2026-09-26 — 옛 연동/노브 사다리 대체) — 읽기 면(타점 정보 등)이 존 순위를
 * 셀 때의 결정론 사다리: **편집 집합 직속 잎의 첫 켜진 theme 조건** → 없으면 기본값(useDisplayT 동형).
 * 화면마다 손으로 다시 쓰면 같은 존 순위가 두 숫자로 갈린다.
 */
export function useThemeReadParams(): ThemeZoneParams {
    const stages = useWorkbench(selectEditingStages);
    return useMemo(() => {
        for (const s of stages) {
            if (!s.enabled) continue;
            const p = s.predicates.find((x) => x.kind === "theme");
            if (p && p.kind === "theme") return p;
        }
        return DEFAULT_THEME_ZONE;
    }, [stages]);
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
