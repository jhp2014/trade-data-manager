// 자동 타점 격자 — **읽기 포트**(번들 통째 + O(1) 조회) + 자동 Point 파생의 **유일한 계산 자리**.
//
// 격자는 서버 파일 캐시의 압축물(구조·신고가 목록)이고, Point 는 여기서 정의(pointDefSlice) 한 벌로
// 즉석 파생한다 — 계산 주체는 core pointsOf(서버 recon 과 같은 함수). 파생을 이 훅 밖에서 또 돌리면
// 1만 객체가 화면 수만큼 복제되므로, 소비자(시트·깔때기·차트 마커)는 전부 이 훅의 산출물을 본다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chartKeyOf, minuteToHms, pointsOf, type DerivedPoint, type PointGrid } from "@trade-data-manager/market/domain";
import { pointGridsQuery } from "../api/queries.js";
import { useWorkbench } from "../store/workbench.js";

export interface PointGridsView {
    isLoading: boolean;
    /** 첫 로드 실패 — 빈 번들을 "격자 없음"으로 오독하지 않게 겉으로 낸다. */
    error: Error | null;
    /** (종목, 날짜) → 격자. 없으면 undefined(기준선 미확정·재료 없음 — 결손은 결손). */
    gridOf(code: string, date: string): PointGrid | undefined;
    version: number | null;
}

export function usePointGrids(): PointGridsView {
    const q = useQuery(pointGridsQuery());
    return useMemo<PointGridsView>(() => {
        const data = q.data ?? null;
        return {
            isLoading: q.isLoading,
            error: (q.error as Error | null) ?? null,
            gridOf: (code, date) => data?.byDate.get(date)?.get(code),
            version: data?.version ?? null,
        };
    }, [q.data, q.isLoading, q.error]);
}

/** 자동 Point 한 줄 — 타점 자연키(stockCode·date·time) 구조 호환(useAllPoints 소비자가 훅 교체로 끝나게). */
export interface AutoPoint {
    stockCode: string;
    date: string;
    /** "HH:MM:00" — 기존 타점 시각 표기와 같은 자(minuteToHms 한 벌). */
    time: string;
    point: DerivedPoint;
}

export interface AutoPointsView {
    isLoading: boolean;
    error: Error | null;
    /** 전 자동 Point(시간순은 차트 안에서만 보장). 정의·번들이 바뀔 때만 재계산. */
    points: AutoPoint[];
    /** 차트키(chartKeyOf) → 그 차트의 파생 Point 목록 — 차트 마커·per-chart 소비자용. */
    byChart: ReadonlyMap<string, DerivedPoint[]>;
}

const EMPTY: DerivedPoint[] = [];

export function useAutoPoints(): AutoPointsView {
    const q = useQuery(pointGridsQuery());
    const def = useWorkbench((s) => s.pointDef);
    return useMemo<AutoPointsView>(() => {
        const data = q.data ?? null;
        const points: AutoPoint[] = [];
        const byChart = new Map<string, DerivedPoint[]>();
        if (data) {
            for (const [date, byCode] of data.byDate) {
                for (const [stockCode, grid] of byCode) {
                    const derived = pointsOf(grid, def);
                    if (derived.length === 0) continue;
                    byChart.set(chartKeyOf({ stockCode, date }), derived);
                    for (const p of derived) points.push({ stockCode, date, time: minuteToHms(p.min), point: p });
                }
            }
        }
        return { isLoading: q.isLoading, error: (q.error as Error | null) ?? null, points, byChart };
    }, [q.data, q.isLoading, q.error, def]);
}

/** 차트 하나의 자동 Point — byChart 조회 헬퍼(없으면 빈 배열 고정 참조 — 렌더 루프에서 새 배열 금지). */
export const autoPointsOfChart = (view: AutoPointsView, code: string, date: string): DerivedPoint[] =>
    view.byChart.get(chartKeyOf({ stockCode: code, date })) ?? EMPTY;
