// Focus 전이의 무효화 규칙 단일 진실 — prev focus → next focus 로 갈 때 파생 축(scope/search)을
// 어떻게 리셋할지 여기 한 곳에서 결정한다. 각 Focus 액션(setDate/setCode/setTime/setFocus/goToPoint)이
// next focus 를 만들어 이 함수에 넘기고 결과를 그대로 set 한다.
// 예전엔 각 액션이 규칙을 제각기 재현해 setDate 만 scope 를 지우고 setFocus 는 날짜가 바뀌어도 옛
// 테마를 남기던 불일치가 있었다 → 여기로 모아 한 규칙만 존재하게 한다.
// (chartZoom 은 "점프=재중심 vs 드리프트=유지" 라는 액션 의도라 규칙이 아니라 각 액션이 명시한다.)
//
// 옛 `activePoint`(선택된 타점을 따로 든 상태)는 2026-09-01 폐지 — 타점이 격자 파생물이 되면서
// "선택된 타점"은 저장물이 아니라 **판정**이 됐다(lib/subject: focus.time 이 그 차트의 자동 타점인가).
import type { Focus, Scope, Search } from "./focusSlice.js";

/** transitionFocus 입력 — 이전 상태의 무효화 대상 축들(WorkbenchState 가 구조적으로 만족). */
export interface FocusInvariants {
    focus: Focus;
    scope: Scope;
    search: Search | null;
}

/** transitionFocus 출력 patch — zustand set 에 그대로 스프레드. */
export interface FocusPatch {
    focus: Focus;
    scope: Scope;
    search: Search | null;
    lastFocusOrigin: string | null;
}

/**
 * 무효화 규칙(prev → next):
 *  - scope.theme 은 "그날의 테마" → 날짜가 바뀌면 stale → null.
 *  - search 는 종목을 따라감 → 종목이 바뀌면 해제 → null.
 *  - 아무 것도 안 바뀌면(동일 값) 모두 유지(no-op) — 재선택이 상태를 헛리셋하지 않는다.
 * time 만의 이동은 파생 축을 건드리지 않는다(리플레이/차트 드리프트 중 연결표시 안정).
 */
export function transitionFocus(prev: FocusInvariants, next: Focus, origin?: string): FocusPatch {
    const dateChanged = next.date !== prev.focus.date;
    const codeChanged = next.code !== prev.focus.code;
    return {
        focus: next,
        scope: dateChanged ? { theme: null } : prev.scope,
        search: codeChanged ? null : prev.search,
        lastFocusOrigin: origin ?? null,
    };
}
