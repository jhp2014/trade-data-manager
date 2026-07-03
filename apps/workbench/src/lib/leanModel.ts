// 당일 축약물(day-reduction) 위 시점 스냅샷 + 유니버스 시간 경계.
// 서버가 종목별 분당 % 시계열을 이미 줬으므로 클라는 이진탐색으로 시점 t 값을 뽑기만 한다(파생 없음).
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchDayReduction, type DayReduction, type ReducedStock } from "../api/dayReduction.js";

export interface Snapshot {
    code: string;
    rate: number; // 등락률 %(t 종가)
    openPct: number; // 당일 시가 %(스칼라 — 눕힌 캔들 몸통 기준)
    highPct: number; // t 까지 고가 %
    lowPct: number; // t 까지 저가 %
    cumAmount: number; // t 까지 누적 거래대금(원)
}

/** times 에서 t 이하 마지막 인덱스(이진탐색). 없으면 -1. */
function lastIndexAtOrBefore(times: number[], t: number): number {
    let lo = 0;
    let hi = times.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

/** 시점 t의 종목 스냅샷. t 이전 데이터 없으면 null(아직 미개장). 값은 이미 % — 서버가 base 반영 완료. */
export function snapshotAt(s: ReducedStock, t: number): Snapshot | null {
    const i = lastIndexAtOrBefore(s.times, t);
    if (i < 0) return null;
    return { code: s.code, rate: s.rate[i], openPct: s.open, highPct: s.high[i], lowPct: s.low[i], cumAmount: s.cumAmount[i] };
}

/** 유니버스 전체의 시간 경계(스크러버 범위 힌트). */
export function boardTimeBounds(reduction: DayReduction): { start: number; end: number } {
    let start = Number.POSITIVE_INFINITY;
    let end = 0;
    for (const s of reduction.stocks) {
        if (s.times.length === 0) continue;
        start = Math.min(start, s.times[0]);
        end = Math.max(end, s.times[s.times.length - 1]);
    }
    return { start: Number.isFinite(start) ? start : 0, end };
}

// 역사 데이터 immutable → staleTime∞, gcTime 넉넉(브라우저 ~10거래일 캐시). 복기·이슈 보드가 같은 캐시 공유.
export function useDayReduction(date: string): UseQueryResult<DayReduction> {
    return useQuery({
        queryKey: ["day-reduction", date],
        queryFn: () => fetchDayReduction(date),
        enabled: date.length > 0,
        staleTime: Infinity,
        gcTime: 60 * 60_000,
    });
}

/** byCode 인덱스(스냅샷 조회용) memo. */
export function useReductionIndex(reduction: DayReduction | undefined): Map<string, ReducedStock> | null {
    return useMemo(() => {
        if (!reduction) return null;
        return new Map(reduction.stocks.map((s) => [s.code, s]));
    }, [reduction]);
}
