// rankViewSlice — 축을 쓰는 화면들이 **공유**하는 상태. 한 화면만 쓰는 건 여기 두지 않는다(그건 그 화면의 것).
//  · pinned: 핀=작업셋. 시트 상단 고정 + 배치 드래그 소스.
//  ⚠ 축 순서는 여기 없다(2026-09-10 `rankAxisOrder` 폐지) — 보는 순서는 화면의 것이라 각 화면이 제
//    저장물을 든다: 시트 = 열 순서(`wb.rankSheetColOrder`, 축만이 아니라 결과·차이 열까지 한 벌 —
//    panels/rank/useSheetColumns), 집합 편성 보드 = 레일 순서(`wb.filterAxisOrder`, 패널 로컬).
//  · revealCol: "저 열을 보여줘"(타점 정보 → 시트의 그 열로 스크롤). at 타임스탬프로 같은 열 재요청도 발화.
//    **시트 열 키 그대로**(`ax:<축키>`·`out:<결과열id>`) — 타점 정보 줄이 축만이 아니라 결과도 지목하게
//    되면서(2026-09-13) 축 id 를 받아 `ax:` 를 붙이던 옛 모양을 일반화했다.
//
// ⚠ 배치 보드가 사라지면서 함께 정리됐다: hoveredPoint(두 패널 링크였는데 이제 시트 안 hover 라 시트의 로컬 상태),
//   rankSort(시트 정렬 → 레인 하이라이트였는데 받을 레인이 없어져 쓰기만 남은 상태였다).
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";

export interface RankViewSlice {
    pinned: string[]; // 핀=작업셋 pk[](순서 유지 = 담은 순)
    revealCol: { key: string; at: number } | null; // 열 노출 요청(세션 한정, 소비 후에도 남음 — at 비교로 1회 처리)
    revealSheetCol: (key: string) => void;
    togglePin: (key: string) => void; // 담기/빼기(+/× 공용)
    addPins: (keys: string[]) => void; // 여러 개 한 번에(끝에 append)
    clearPins: () => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    pinned: [],
    revealCol: null,

    revealSheetCol: (key) => set(() => ({ revealCol: { key, at: Date.now() } })),
    togglePin: (key) => set((s) => (s.pinned.includes(key) ? { pinned: s.pinned.filter((k) => k !== key) } : { pinned: [...s.pinned, key] })),
    addPins: (keys) => set((s) => ({ pinned: [...s.pinned, ...keys.filter((k) => !s.pinned.includes(k))] })),
    clearPins: () => set(() => ({ pinned: [] })),
});
