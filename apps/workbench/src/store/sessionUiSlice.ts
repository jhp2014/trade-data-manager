// **세션 수명** 패널 상태 — 스토어에는 살고 localStorage 에는 안 사는 자리.
//
// panelUi(영속)와 짝이지만 수명이 다르다. 갈림길은 "그 값이 **지금 데이터에 매여 있나**":
//   · 헤더 토글·시트 컬럼처럼 데이터와 무관한 취향 → panelUi(영속). 새로고침에도 그대로여야 한다.
//   · 정규화 패널의 배율·위치처럼 **지금 보고 있는 항목을 겨냥해 맞춘 것** → 여기.
//     어제 맞춘 배율을 오늘 항목에 씌우면 어긋난 자리에서 시작한다. 새로고침 = 새 시작이 정직하다.
//
// 반대로 **프리셋 전환(dockview fromJSON = 패널 재마운트)에는 살아남아야 한다** — 화면만 바꿨을 뿐
// 보던 것은 그대로이기 때문이다. 컴포넌트 useState 로 두면 그때 날아간다. 그 사이를 메우는 층이다.
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";

export type SessionUiBag = Record<string, Record<string, unknown>>; // scopeId → { key: value }

export interface SessionUiSlice {
    sessionUi: SessionUiBag;
    setSessionUi: (scopeId: string, key: string, value: unknown) => void;
}

export const createSessionUiSlice: StateCreator<WorkbenchState, [], [], SessionUiSlice> = (set) => ({
    sessionUi: {},
    setSessionUi: (scopeId, key, value) =>
        set((s) => ({ sessionUi: { ...s.sessionUi, [scopeId]: { ...(s.sessionUi[scopeId] ?? {}), [key]: value } } })),
});
