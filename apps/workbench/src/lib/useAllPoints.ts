// 전체 복기 타점 — **읽기 포트**(테이블 전량이 필요한 소비자용: 작업셋·시트·깔때기·겹쳐 그리기).
// 재료는 큐레이션 복제본(all-points 테이블 키) 그대로 — 패널이 쿼리 키를 직접 만지지 않게 한 겹.
// 한 차트 조각만 필요하면 useChartPoints(code,date)(복제본 셀렉터)를 쓴다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReviewPoint } from "../api/reviewPoints.js";
import { allPointsQuery } from "../api/queries.js";

const EMPTY: ReviewPoint[] = [];

export interface AllPointsView {
    /** 날짜 내림차순, 같은 날 시각 오름차순(피드 정렬 그대로). 읽기 전용으로 다룰 것(캐시 원본). */
    points: ReviewPoint[];
    isLoading: boolean;
    /** 첫 로드 실패 — 빈 목록을 "없음"으로 오독하지 않게 겉으로 낸다(usePresence 와 같은 결). */
    error: Error | null;
}

export function useAllPoints(): AllPointsView {
    const q = useQuery(allPointsQuery());
    return useMemo(
        () => ({ points: q.data ?? EMPTY, isLoading: q.isLoading, error: (q.error as Error | null) ?? null }),
        [q.data, q.isLoading, q.error],
    );
}
