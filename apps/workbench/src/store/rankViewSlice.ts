// rankViewSlice — 배치(레인)·시트 두 뷰가 공유하는 상호작용 상태. 링크의 단일 진실.
//  · hoveredPoint: 포인터 스침 1개(양 패널 링크) — 그 타점을 전 축에서 강조(프로파일).
//  · pinned: 핀=작업셋=배치 보드 트레이(공유 하나). 배치 드래그 소스 + 시트 상단 고정.
//  · rankAxisOrder: 축 열/레인 순서 — 양방향 동기화(양쪽에서 재정렬), localStorage 영속.
//  · revealAxis: "저 축을 보여줘" 요청(타점 정보 → 배치 보드 레인 스크롤). at 타임스탬프로 같은 축 재요청도 발화.
// (소프트 선택은 폐기 — 필터 좁히기/흐리게로 충분, 드래그도 제거.)
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import { loadJson, saveJson } from "./persist.js";

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const loadOrder = (): string[] => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [];

export interface RankViewSlice {
    hoveredPoint: string | null;
    pinned: string[]; // 핀=작업셋 pk[](순서 유지 = 담은 순). 배치 보드 트레이와 같은 상태.
    rankAxisOrder: string[]; // axisId 순서(빈 배열 = 서버순 폴백). pref 에 없는 새 축은 소비측이 뒤로.
    rankSort: { target: string; dir: 1 | -1 } | null; // 시트 정렬 기준 → 배치 보드 하이라이트(target = axisId | "date" | "time"). 세션 한정.
    revealAxis: { axisId: string; at: number } | null; // 축 노출 요청(세션 한정, 소비 후에도 남음 — at 비교로 1회 처리)
    setHoveredPoint: (key: string | null) => void;
    revealRankAxis: (axisId: string) => void;
    setRankSort: (v: { target: string; dir: 1 | -1 } | null) => void;
    togglePin: (key: string) => void; // 담기/빼기(+/× 공용)
    addPins: (keys: string[]) => void; // 여러 개 한 번에(끝에 append)
    clearPins: () => void;
    setRankAxisOrder: (order: string[]) => void;
    /** 분석(경로) 파라미터 — 필터가 아니라 보기 손잡이라 옛 필터 슬라이스에서 이리로 이사. 세션 한정. */
    rankHorizon: number; // 진입 후 crop 분
    rankBucket: number; // 히트맵 집계 칸 폭(분) — 1/5/10
    setRankHorizon: (minutes: number) => void;
    setRankBucket: (minutes: number) => void;
}

export const createRankViewSlice: StateCreator<WorkbenchState, [], [], RankViewSlice> = (set) => ({
    hoveredPoint: null,
    pinned: [],
    rankHorizon: 90,
    rankBucket: 1,
    rankAxisOrder: loadOrder(),
    rankSort: null,
    revealAxis: null,

    setHoveredPoint: (key) => set(() => ({ hoveredPoint: key })),
    revealRankAxis: (axisId) => set(() => ({ revealAxis: { axisId, at: Date.now() } })),
    setRankSort: (v) => set(() => ({ rankSort: v })),
    togglePin: (key) => set((s) => (s.pinned.includes(key) ? { pinned: s.pinned.filter((k) => k !== key) } : { pinned: [...s.pinned, key] })),
    addPins: (keys) => set((s) => ({ pinned: [...s.pinned, ...keys.filter((k) => !s.pinned.includes(k))] })),
    clearPins: () => set(() => ({ pinned: [] })),
    setRankAxisOrder: (order) => { saveJson(AXIS_ORDER_KEY, order); set(() => ({ rankAxisOrder: order })); },
    setRankHorizon: (minutes) => set(() => ({ rankHorizon: Math.max(1, Math.round(minutes)) })),
    setRankBucket: (minutes) => set(() => ({ rankBucket: Math.max(1, Math.round(minutes)) })),
});
