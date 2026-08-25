// useSessionUi — useState 드롭인. 값은 세션 스토어(sessionUi)에 얹혀 **프리셋 전환(재마운트)에는 살고
// 새로고침에는 초기화**된다. 반환 시그니처는 useState 와 동일(값/함수형 업데이트 모두 지원).
// 영속이 필요하면 usePanelUi 를 쓸 것 — 수명의 갈림길은 sessionUiSlice 머리 주석에 있다.
import type { Dispatch, SetStateAction } from "react";
import { useWorkbench } from "./workbench.js";

export function useSessionUi<T>(scopeId: string, key: string, def: T): [T, Dispatch<SetStateAction<T>>] {
    const raw = useWorkbench((s) => s.sessionUi[scopeId]?.[key]);
    const value = (raw === undefined ? def : raw) as T;
    const set: Dispatch<SetStateAction<T>> = (action) => {
        // 최신값은 스토어에서 직접 읽어 함수형 업데이트의 stale 클로저를 피한다(usePanelUi 와 같은 규칙).
        const cur = (useWorkbench.getState().sessionUi[scopeId]?.[key] ?? def) as T;
        const next = typeof action === "function" ? (action as (p: T) => T)(cur) : action;
        useWorkbench.getState().setSessionUi(scopeId, key, next);
    };
    return [value, set];
}
