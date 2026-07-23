// 순위 필터 슬라이스 — 배치 보드(경계 지정)와 분석 대시보드(결과)가 공유하는 밴드·horizon.
//  · 밴드 = 축마다 슬롯 앵커 경계 lo/hi(slotId). 한쪽만 = 반열림([lo,∞) 또는 (∞,hi]), 둘 다 = 구간.
//    slotId 로 들고(슬롯 앵커) orderKey 는 소비측이 그 축 줄에서 해석 — reindex 무해.
//  · horizon = 진입 후 crop 분(숫자입력·히트맵 세로선 드래그). maxT 는 소비측이 클램프.
// 임시 질의 상태라 영속 안 함(세션 한정).
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";

export type RankBoundEdge = "lo" | "hi";
export interface RankBand {
    lo?: string; // 이상 경계(작은 orderKey 쪽) slotId
    hi?: string; // 이하 경계(큰 orderKey 쪽) slotId
}

export interface RankFilterSlice {
    rankBands: Record<string, RankBand>; // axisId → 경계
    rankHorizon: number; // 진입 후 crop 분
    rankBucket: number; // 히트맵 집계 칸 폭(분) — 1/5/10
    setRankBound: (axisId: string, edge: RankBoundEdge, slotId: string) => void; // 같은 경계·같은 슬롯 재지정 = 토글 해제
    clearRankBand: (axisId: string) => void;
    clearRankFilter: () => void;
    setRankHorizon: (minutes: number) => void;
    setRankBucket: (minutes: number) => void;
}

export const createRankFilterSlice: StateCreator<WorkbenchState, [], [], RankFilterSlice> = (set) => ({
    rankBands: {},
    rankHorizon: 90,
    rankBucket: 1,

    setRankBound: (axisId, edge, slotId) =>
        set((s) => {
            const cur = s.rankBands[axisId] ?? {};
            const next: RankBand = cur[edge] === slotId ? { ...cur, [edge]: undefined } : { ...cur, [edge]: slotId };
            if (!next.lo && !next.hi) {
                const m = { ...s.rankBands };
                delete m[axisId];
                return { rankBands: m };
            }
            return { rankBands: { ...s.rankBands, [axisId]: next } };
        }),
    clearRankBand: (axisId) =>
        set((s) => {
            const m = { ...s.rankBands };
            delete m[axisId];
            return { rankBands: m };
        }),
    clearRankFilter: () => set(() => ({ rankBands: {} })),
    setRankHorizon: (minutes) => set(() => ({ rankHorizon: Math.max(1, Math.round(minutes)) })),
    setRankBucket: (minutes) => set(() => ({ rankBucket: Math.max(1, Math.round(minutes)) })),
});
