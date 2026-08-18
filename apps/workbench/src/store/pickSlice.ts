// 짚음 채널(연동 슬롯) — **하나**다. 여러 패널이 만들고(그룹 체인·시트 밴드·필터 칸) 모든 소비 패널이 같이 본다.
//
// 항목 스냅샷이 아니라 **집합 참조(SetRef)** 를 나른다 — 소비 패널이 리졸버로 읽는 순간마다 푼다(라이브).
//
// 영속하지 않는다: 짚음은 **세션 시선**이지 조건이 아니다(조건의 저자는 깔때기 하나). 새로고침하면
// 풀리는 게 맞다 — 남아 있으면 "왜 절반만 진하지"로 시작하는 아침이 된다. (세션 한정이라 참조의
// 세션 2종(groupChain·items)도 여기엔 올라탈 수 있다 — 패널 바인딩 영속과 다른 점.)
//
// 덮어쓰기다: 다른 패널에서 짚으면 앞의 것이 대체된다(시선은 하나). 쌓는 건 각 패널 안에서 한다
// (그룹 체인이 Ctrl+클릭으로 교집합을 쌓듯이).
import type { StateCreator } from "zustand";
import type { PickSet } from "../lib/pick.js";
import type { WorkbenchState } from "./workbench.js";

export interface PickSlice {
    pick: PickSet | null;
    setPick: (p: PickSet | null) => void;
    /** 그 출처의 짚음만 거둔다 — 만든 패널이 정리할 때(체인 비우기·언마운트). 남의 것은 안 건드린다. */
    clearPickFrom: (source: PickSet["source"]) => void;
}

export const createPickSlice: StateCreator<WorkbenchState, [], [], PickSlice> = (set) => ({
    pick: null,
    setPick: (pick) => set({ pick }),
    clearPickFrom: (source) => set((s) => (s.pick?.source === source ? { pick: null } : {})),
});
