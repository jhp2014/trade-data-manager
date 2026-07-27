// usePanelUi — useState 드롭인. 패널별 store(panelUi, localStorage 영속)에 상태를 얹어
// 프리셋 전환(재마운트)·새로고침에도 유지되게 한다. 반환 시그니처는 useState 와 동일(값/함수형 업데이트 모두 지원).
import type { Dispatch, SetStateAction } from "react";
import { useWorkbench } from "./workbench.js";

export function usePanelUi<T>(panelId: string, key: string, def: T): [T, Dispatch<SetStateAction<T>>] {
    const raw = useWorkbench((s) => s.panelUi[panelId]?.[key]);
    const value = (raw === undefined ? def : raw) as T;
    const set: Dispatch<SetStateAction<T>> = (action) => {
        // 최신값은 store 에서 직접 읽어 함수형 업데이트의 stale 클로저를 피한다.
        const cur = (useWorkbench.getState().panelUi[panelId]?.[key] ?? def) as T;
        const nextVal = typeof action === "function" ? (action as (p: T) => T)(cur) : action;
        useWorkbench.getState().setPanelUi(panelId, key, nextVal);
    };
    return [value, set];
}
