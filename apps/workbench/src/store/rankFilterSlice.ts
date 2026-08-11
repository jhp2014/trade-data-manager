// 순위 필터 슬라이스 — 배치 보드·시트·분석 대시보드가 공유하는 통합 필터.
//  · 필터 = 차원들의 AND. 차원 = 축별 밴드 / 날짜 구간(OR) / 시간 구간(OR) / 그룹식(DNF).
//    - 밴드 = 축마다 슬롯 앵커 경계 lo/hi(slotId). 한쪽만 = 반열림, 둘 다 = 구간. reindex 무해.
//    - 날짜/시간 = 구간 배열, 배열 안은 OR(아무 구간에 들면 통과). 빈 배열 = 그 차원 무제한(전체).
//    - 그룹 = DNF(그룹 OR / 그룹 안 AND / 리터럴 부정). 빈 식 = 그 차원 무제한. 규칙은 panels/rank/groupFilter.
//  · horizon/bucket = 분석(경로) 파라미터. 임시 질의 상태라 영속 안 함(세션 한정).
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";
import { EMPTY_TAG_EXPR, type GroupExpr } from "../panels/rank/groupFilter.js";

export type RankBoundEdge = "lo" | "hi";
export interface RankBand {
    lo?: string; // 이상 경계(작은 orderKey 쪽) slotId
    hi?: string; // 이하 경계(큰 orderKey 쪽) slotId
}
export interface DateRange { from: string; to: string } // YYYY-MM-DD (양끝 포함)
export interface TimeRange { from: string; to: string } // HH:MM (양끝 포함)

/**
 * 계산 축 경계 — **타점 앵커가 기본**이고 값 직접 지정이 보조다.
 *
 * 왜 앵커인가: 계산 축의 자리는 수식이 정한다. 수식을 고치면 모든 값이 움직이는데, 경계만 숫자로 굳어 있으면
 * "이 타점보다 위"라는 원래 판단이 조용히 다른 뜻이 된다. 앵커로 두면 경계가 그 타점을 따라 함께 움직인다.
 * (판단 축의 slot 앵커와 같은 취지지만 slotId 와 달리 타점 자연키는 재계산에 안 흔들린다.)
 * value 는 "10% 이상" 같이 데이터와 무관한 절대 기준을 걸고 싶을 때만.
 */
export type AxisBound = { kind: "point"; point: string } | { kind: "value"; value: number };
/** 한 구간. 한쪽이 없으면 반열림(그 방향 무제한) — 날짜/시간과 달리 "이 값 이상"이 자연스러운 조작이라. */
export interface AxisValueRange { from?: AxisBound; to?: AxisBound }

export interface RankFilterSlice {
    rankBands: Record<string, RankBand>; // axisId → 경계
    /** 계산 축 값 구간 — axisId(c:*) → 구간 배열. 배열 안은 OR, 축끼리는 AND(날짜·시간과 같은 규칙). */
    axisValueRanges: Record<string, AxisValueRange[]>;
    dateRanges: DateRange[]; // OR
    timeRanges: TimeRange[]; // OR
    groupExpr: GroupExpr; // 그룹 DNF(빈 식 = 무제한)
    rankHorizon: number; // 진입 후 crop 분
    rankBucket: number; // 히트맵 집계 칸 폭(분) — 1/5/10
    setRankBound: (axisId: string, edge: RankBoundEdge, slotId: string) => void; // 같은 경계·같은 슬롯 재지정 = 토글 해제
    setRankBandRange: (axisId: string, lo?: string, hi?: string) => void; // 밴드 직접 설정(토글 아님). 양끝 없으면 축 밴드 제거.
    /** 필터 전체 교체(저장 필터 불러오기) — 저장한 그대로 재현되도록 전 차원을 한 번에 갈아끼운다. */
    applyRankFilter: (v: { bands: Record<string, RankBand>; axisValueRanges: Record<string, AxisValueRange[]>; dateRanges: DateRange[]; timeRanges: TimeRange[]; groupExpr: GroupExpr }) => void;
    clearRankBand: (axisId: string) => void;
    setAxisValueRanges: (axisId: string, ranges: AxisValueRange[]) => void; // 빈 배열 = 그 축 해제
    /** 한쪽 경계만 지정(시트 셀 우클릭) — 같은 경계에 같은 앵커를 다시 주면 토글 해제. 반열림 구간 하나를 유지한다. */
    setAxisValueBound: (axisId: string, edge: "from" | "to", bound: AxisBound) => void;
    setDateRanges: (ranges: DateRange[]) => void; // 배열 교체(레일 드래그 수정·칩 삭제 공용)
    setTimeRanges: (ranges: TimeRange[]) => void;
    setGroupExpr: (expr: GroupExpr) => void; // 식 전체 교체(편집 연산은 순수 groupFilter 가 계산해 넘긴다)
    clearRankFilter: () => void; // 밴드·날짜·시간·그룹 전부 해제
    setRankHorizon: (minutes: number) => void;
    setRankBucket: (minutes: number) => void;
}

const sameBound = (a: AxisBound | undefined, b: AxisBound): boolean =>
    a != null && a.kind === b.kind && (a.kind === "point" ? a.point === (b as { point: string }).point : a.value === (b as { value: number }).value);

export const createRankFilterSlice: StateCreator<WorkbenchState, [], [], RankFilterSlice> = (set) => ({
    rankBands: {},
    axisValueRanges: {},
    dateRanges: [],
    timeRanges: [],
    groupExpr: EMPTY_TAG_EXPR,
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
    applyRankFilter: ({ bands, axisValueRanges, dateRanges, timeRanges, groupExpr }) =>
        set(() => ({ rankBands: { ...bands }, axisValueRanges: { ...axisValueRanges }, dateRanges, timeRanges, groupExpr })),
    setAxisValueRanges: (axisId, ranges) =>
        set((s) => {
            const m = { ...s.axisValueRanges };
            if (ranges.length === 0) delete m[axisId];
            else m[axisId] = ranges;
            return { axisValueRanges: m };
        }),
    setAxisValueBound: (axisId, edge, bound) =>
        set((s) => {
            // 반열림 구간 **하나**만 유지한다(여러 구간은 레일 드래그로 만든다). 같은 앵커 재지정 = 해제.
            const cur = s.axisValueRanges[axisId]?.[0] ?? {};
            const same = sameBound(cur[edge], bound);
            const next: AxisValueRange = { ...cur, [edge]: same ? undefined : bound };
            const m = { ...s.axisValueRanges };
            if (!next.from && !next.to) delete m[axisId];
            else m[axisId] = [next];
            return { axisValueRanges: m };
        }),
    clearRankBand: (axisId) =>
        set((s) => {
            const m = { ...s.rankBands };
            delete m[axisId];
            return { rankBands: m };
        }),
    setDateRanges: (ranges) => set(() => ({ dateRanges: ranges })),
    setTimeRanges: (ranges) => set(() => ({ timeRanges: ranges })),
    setGroupExpr: (expr) => set(() => ({ groupExpr: expr })),
    clearRankFilter: () => set(() => ({ rankBands: {}, axisValueRanges: {}, dateRanges: [], timeRanges: [], groupExpr: EMPTY_TAG_EXPR })),
    setRankHorizon: (minutes) => set(() => ({ rankHorizon: Math.max(1, Math.round(minutes)) })),
    setRankBucket: (minutes) => set(() => ({ rankBucket: Math.max(1, Math.round(minutes)) })),
});
