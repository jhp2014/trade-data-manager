// 당일 복기 파생값(day-replay) 위 시점 스냅샷.
// 서버가 종목별 분당 % 시계열을 이미 줬으므로 클라는 이진탐색으로 시점 t 값을 뽑기만 한다(파생 없음).
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { type DayReplay, type MinuteDerived, type ReplayStock } from "../api/dayReplay.js";
import { dayReplayQuery } from "../api/queries.js";

export interface Snapshot {
    code: string;
    rate: number; // 등락률 %(t 종가)
    openPct: number; // 당일 시가 %(스칼라 — 눕힌 캔들 몸통 기준)
    highPct: number; // t 까지 고가 %
    lowPct: number; // t 까지 저가 %
    cumAmount: number; // t 까지 누적 거래대금(원)
}

/** times 에서 t 이하 마지막 인덱스(이진탐색). 없으면 -1. */
export function lastIndexAtOrBefore(times: number[], t: number): number {
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
export function snapshotAt(s: MinuteDerived, t: number): Snapshot | null {
    const i = lastIndexAtOrBefore(s.times, t);
    if (i < 0) return null;
    return { code: s.code, rate: s.rate[i], openPct: s.open, highPct: s.high[i], lowPct: s.low[i], cumAmount: s.cumAmount[i] };
}

// 쿼리 옵션은 api/queries.ts 의 dayReplayQuery 한 곳("라우팅은 여기 한 곳" 규칙) — 여긴 훅 겉옷만.
export function useDayReplay(date: string): UseQueryResult<DayReplay> {
    return useQuery(dayReplayQuery(date));
}

/** byCode 인덱스(스냅샷+메타 조회용) memo. */
export function useReplayIndex(reduction: DayReplay | undefined): Map<string, ReplayStock> | null {
    return useMemo(() => {
        if (!reduction) return null;
        return new Map(reduction.stocks.map((s) => [s.code, s]));
    }, [reduction]);
}
