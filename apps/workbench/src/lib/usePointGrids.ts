// 자동 타점 격자 — **읽기 포트**(번들 통째 + O(1) 조회) + 자동 Point 파생의 **유일한 계산 자리**.
//
// 격자는 서버 파일 캐시의 압축물(구조·신고가 목록)이고, Point 는 여기서 정의(pointDefSlice) 한 벌로
// 즉석 파생한다 — 계산 주체는 core pointsOf(서버 recon 과 같은 함수). 파생을 이 훅 밖에서 또 돌리면
// 1만 객체가 화면 수만큼 복제되므로, 소비자(시트·깔때기·차트 마커)는 전부 이 훅의 산출물을 본다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chartKeyOf, minuteToHms, pointsOf, type DerivedPoint, type PointDefinition, type PointGrid, type ReviewPointKey } from "@trade-data-manager/market/domain";
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

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 usePointGrids). */
export function usePointGridsValue(): PointGridsView {
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

/** 자동 Point 한 줄 — 타점 자연키(stockCode·date·time) + 판정 산출물. */
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
    /**
     * 행 원천용 키 목록 — 날짜 내림차순, 같은 날 시각 오름차순. **여기서 한 번만** 만든다:
     * 소비자(시트·깔때기·작업셋·레일·통계)가 각자 정렬하면 1만 개짜리 배열이 화면 수만큼 복제되고,
     * 참조가 갈려 파생 memo(useThemeStrengthStats 모듈 캐시)가 통째로 헛돈다.
     */
    rows: readonly ReviewPointKey[];
    /** 차트키(chartKeyOf) → 그 차트의 파생 Point 목록 — 차트 마커·per-chart 소비자용. */
    byChart: ReadonlyMap<string, DerivedPoint[]>;
}

const EMPTY: DerivedPoint[] = [];

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(파생이 인스턴스마다 복제된다). */
export function useAutoPointsValue(): AutoPointsView {
    const q = useQuery(pointGridsQuery());
    // 판정 노브만 구독한다 — `lens` 는 pointsOf 가 안 보는 필드라(행·행 시각 불변 계약) 통째 의존하면 렌즈 토글이
    // 1만 Point 를 헛재파생하고 `points` 참조까지 갈아 하류 memo(useThemeStrengthStats 모듈 캐시)를 무효화한다.
    const { baselineGateEok, renewalGateEok, excludeUptoMin, mergeRisePct, bullOnly } = useWorkbench((s) => s.pointDef);
    const def = useMemo<PointDefinition>(
        () => ({ baselineGateEok, renewalGateEok, excludeUptoMin, mergeRisePct, bullOnly, lens: "renewal" }),
        [baselineGateEok, renewalGateEok, excludeUptoMin, mergeRisePct, bullOnly],
    );
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
        const rows: ReviewPointKey[] = points
            .map((a) => ({ stockCode: a.stockCode, date: a.date, time: a.time }))
            .sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
        return { isLoading: q.isLoading, error: (q.error as Error | null) ?? null, points, byChart, rows };
    }, [q.data, q.isLoading, q.error, def]);
}

/** 차트 하나의 자동 Point — byChart 조회 헬퍼(없으면 빈 배열 고정 참조 — 렌더 루프에서 새 배열 금지). */
export const autoPointsOfChart = (view: AutoPointsView, code: string, date: string): DerivedPoint[] =>
    view.byChart.get(chartKeyOf({ stockCode: code, date })) ?? EMPTY;
