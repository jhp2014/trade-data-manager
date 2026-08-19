// rankViewSlice — 축을 쓰는 화면들이 **공유**하는 상태. 한 화면만 쓰는 건 여기 두지 않는다(그건 그 화면의 것).
//  · pinned: 핀=작업셋. 시트 상단 고정 + 배치 드래그 소스.
//  · rankAxisOrder: 축 순서 — 시트 열과 필터 보드 레일이 같은 순서를 본다. localStorage 영속.
//  · revealAxis: "저 축을 보여줘"(타점 정보 → 시트의 그 열로 스크롤). at 타임스탬프로 같은 축 재요청도 발화.
//    axisId = 축의 **클라 키**(`p:<이름>`·`c:<키>`) — 시트 열 키(`ax:<키>`)와 같은 좌표라야 열을 되찾는다.
//
// ⚠ 배치 보드가 사라지면서 함께 정리됐다: hoveredPoint(두 패널 링크였는데 이제 시트 안 hover 라 시트의 로컬 상태),
//   rankSort(시트 정렬 → 레인 하이라이트였는데 받을 레인이 없어져 쓰기만 남은 상태였다).
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import { loadJson, saveJson } from "./persist.js";

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const loadOrder = (): string[] => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [];

export interface RankViewSlice {
    pinned: string[]; // 핀=작업셋 pk[](순서 유지 = 담은 순)
    rankAxisOrder: string[]; // axisId 순서(빈 배열 = 서버순 폴백). pref 에 없는 새 축은 소비측이 뒤로.
    revealAxis: { axisId: string; at: number } | null; // 축 노출 요청(세션 한정, 소비 후에도 남음 — at 비교로 1회 처리)
    revealRankAxis: (axisId: string) => void;
    togglePin: (key: string) => void; // 담기/빼기(+/× 공용)
    addPins: (keys: string[]) => void; // 여러 개 한 번에(끝에 append)
    clearPins: () => void;
    setRankAxisOrder: (order: string[]) => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    pinned: [],
    rankAxisOrder: loadOrder(),
    revealAxis: null,

    revealRankAxis: (axisId) => set(() => ({ revealAxis: { axisId, at: Date.now() } })),
    togglePin: (key) => set((s) => (s.pinned.includes(key) ? { pinned: s.pinned.filter((k) => k !== key) } : { pinned: [...s.pinned, key] })),
    addPins: (keys) => set((s) => ({ pinned: [...s.pinned, ...keys.filter((k) => !s.pinned.includes(k))] })),
    clearPins: () => set(() => ({ pinned: [] })),
    setRankAxisOrder: (order) => { saveJson(AXIS_ORDER_KEY, order); set(() => ({ rankAxisOrder: order })); },
});
