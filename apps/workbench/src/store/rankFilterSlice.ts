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
    rankBandsPast: Record<string, RankBand>[]; // 밴드 변경 undo 스택(시트 drill-down 되돌리기). 밴드 바뀔 때마다 직전 상태 push.
    rankHorizon: number; // 진입 후 crop 분
    rankBucket: number; // 히트맵 집계 칸 폭(분) — 1/5/10
    setRankBound: (axisId: string, edge: RankBoundEdge, slotId: string) => void; // 같은 경계·같은 슬롯 재지정 = 토글 해제
    setRankBandRange: (axisId: string, lo?: string, hi?: string) => void; // 밴드 직접 설정(토글 아님) — 시트 드래그 선택용. 양끝 없으면 축 밴드 제거.
    clearRankBand: (axisId: string) => void;
    clearRankFilter: () => void;
    undoRankBands: () => void; // 직전 밴드 상태로 복원(drill-down 한 칸 뒤로).
    setRankHorizon: (minutes: number) => void;
    setRankBucket: (minutes: number) => void;
}

const HISTORY_CAP = 50;
// 현재 밴드를 undo 스택에 얹는다(호출 시점의 rankBands = 변경 직전 상태).
const pushPast = (s: RankFilterSlice): Record<string, RankBand>[] => [...s.rankBandsPast, s.rankBands].slice(-HISTORY_CAP);

export const createRankFilterSlice: StateCreator<WorkbenchState, [], [], RankFilterSlice> = (set) => ({
    rankBands: {},
    rankBandsPast: [],
    rankHorizon: 90,
    rankBucket: 1,

    setRankBound: (axisId, edge, slotId) =>
        set((s) => {
            const cur = s.rankBands[axisId] ?? {};
            const next: RankBand = cur[edge] === slotId ? { ...cur, [edge]: undefined } : { ...cur, [edge]: slotId };
            const m = { ...s.rankBands };
            if (!next.lo && !next.hi) delete m[axisId];
            else m[axisId] = next;
            return { rankBands: m, rankBandsPast: pushPast(s) };
        }),
    setRankBandRange: (axisId, lo, hi) =>
        set((s) => {
            const m = { ...s.rankBands };
            if (!lo && !hi) delete m[axisId];
            else m[axisId] = { lo, hi };
            return { rankBands: m, rankBandsPast: pushPast(s) };
        }),
    clearRankBand: (axisId) =>
        set((s) => {
            const m = { ...s.rankBands };
            delete m[axisId];
            return { rankBands: m, rankBandsPast: pushPast(s) };
        }),
    clearRankFilter: () => set((s) => ({ rankBands: {}, rankBandsPast: pushPast(s) })),
    undoRankBands: () =>
        set((s) => {
            if (s.rankBandsPast.length === 0) return {};
            const past = s.rankBandsPast.slice();
            const prev = past.pop() ?? {};
            return { rankBands: prev, rankBandsPast: past };
        }),
    setRankHorizon: (minutes) => set(() => ({ rankHorizon: Math.max(1, Math.round(minutes)) })),
    setRankBucket: (minutes) => set(() => ({ rankBucket: Math.max(1, Math.round(minutes)) })),
});
