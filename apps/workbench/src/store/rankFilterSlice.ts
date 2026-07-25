// 순위 필터 슬라이스 — 배치 보드·시트·분석 대시보드가 공유하는 통합 필터.
//  · 필터 = 차원들의 AND. 차원 = 축별 밴드 / 날짜 구간(OR) / 시간 구간(OR).
//    - 밴드 = 축마다 슬롯 앵커 경계 lo/hi(slotId). 한쪽만 = 반열림, 둘 다 = 구간. reindex 무해.
//    - 날짜/시간 = 구간 배열, 배열 안은 OR(아무 구간에 들면 통과). 빈 배열 = 그 차원 무제한(전체).
//  · horizon/bucket = 분석(경로) 파라미터. 임시 질의 상태라 영속 안 함(세션 한정).
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";

export type RankBoundEdge = "lo" | "hi";
export interface RankBand {
    lo?: string; // 이상 경계(작은 orderKey 쪽) slotId
    hi?: string; // 이하 경계(큰 orderKey 쪽) slotId
}
export interface DateRange { from: string; to: string } // YYYY-MM-DD (양끝 포함)
export interface TimeRange { from: string; to: string } // HH:MM (양끝 포함)

export interface RankFilterSlice {
    rankBands: Record<string, RankBand>; // axisId → 경계
    dateRanges: DateRange[]; // OR
    timeRanges: TimeRange[]; // OR
    rankHorizon: number; // 진입 후 crop 분
    rankBucket: number; // 히트맵 집계 칸 폭(분) — 1/5/10
    setRankBound: (axisId: string, edge: RankBoundEdge, slotId: string) => void; // 같은 경계·같은 슬롯 재지정 = 토글 해제
    setRankBandRange: (axisId: string, lo?: string, hi?: string) => void; // 밴드 직접 설정(토글 아님). 양끝 없으면 축 밴드 제거.
    applyRankBands: (bands: Record<string, RankBand>) => void; // 밴드 전체 교체(저장 필터 불러오기)
    clearRankBand: (axisId: string) => void;
    setDateRanges: (ranges: DateRange[]) => void; // 배열 교체(레일 드래그 수정·칩 삭제 공용)
    setTimeRanges: (ranges: TimeRange[]) => void;
    clearRankFilter: () => void; // 밴드·날짜·시간 전부 해제
    setRankHorizon: (minutes: number) => void;
    setRankBucket: (minutes: number) => void;
}

export const createRankFilterSlice: StateCreator<WorkbenchState, [], [], RankFilterSlice> = (set) => ({
    rankBands: {},
    dateRanges: [],
    timeRanges: [],
    rankHorizon: 90,
    rankBucket: 1,

    setRankBound: (axisId, edge, slotId) =>
        set((s) => {
            const cur = s.rankBands[axisId] ?? {};
            const next: RankBand = cur[edge] === slotId ? { ...cur, [edge]: undefined } : { ...cur, [edge]: slotId };
            const m = { ...s.rankBands };
            if (!next.lo && !next.hi) delete m[axisId];
            else m[axisId] = next;
            return { rankBands: m };
        }),
    setRankBandRange: (axisId, lo, hi) =>
        set((s) => {
            const m = { ...s.rankBands };
            if (!lo && !hi) delete m[axisId];
            else m[axisId] = { lo, hi };
            return { rankBands: m };
        }),
    applyRankBands: (bands) => set(() => ({ rankBands: { ...bands } })),
    clearRankBand: (axisId) =>
        set((s) => {
            const m = { ...s.rankBands };
            delete m[axisId];
            return { rankBands: m };
        }),
    setDateRanges: (ranges) => set(() => ({ dateRanges: ranges })),
    setTimeRanges: (ranges) => set(() => ({ timeRanges: ranges })),
    clearRankFilter: () => set(() => ({ rankBands: {}, dateRanges: [], timeRanges: [] })),
    setRankHorizon: (minutes) => set(() => ({ rankHorizon: Math.max(1, Math.round(minutes)) })),
    setRankBucket: (minutes) => set(() => ({ rankBucket: Math.max(1, Math.round(minutes)) })),
});
