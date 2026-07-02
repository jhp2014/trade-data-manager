import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchDayCharts } from "../api/dayCharts.js";
import type { ChartBundle } from "../api/chart.js";
import { buildDayModel, type DayModel } from "./boardSnapshot.js";

// 당일 전체 차트 = date당 1회 페치(RQ 캐시). 차트 패널·테마보드가 같은 쿼리키를 공유해 중복 페치 0.
// 역사 데이터라 immutable → staleTime Infinity(재페치 없음).
export function useDayCharts(date: string): UseQueryResult<ChartBundle[]> {
    return useQuery({
        queryKey: ["day-charts", date],
        queryFn: () => fetchDayCharts(date),
        enabled: date.length > 0,
        staleTime: Infinity,
        gcTime: 30 * 60_000,
    });
}

// 프리컴퓨트 DayModel — bundles 가 바뀔 때만 재계산(무거운 프리컴퓨트를 memo).
export function useDayModel(date: string): {
    model: DayModel | null;
    bundles: ChartBundle[] | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
} {
    const q = useDayCharts(date);
    const model = useMemo(() => (q.data ? buildDayModel(q.data, date) : null), [q.data, date]);
    return { model, bundles: q.data, isLoading: q.isLoading, isError: q.isError, error: q.error };
}
