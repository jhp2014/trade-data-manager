// LeanBoard(서버 lean 지표) 위 시점 스냅샷 + 유니버스 시간 경계.
// 서버가 종목별 running 시리즈를 이미 줬으므로 클라는 이진탐색으로 시점 t 값을 뽑고 %만 파생.
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchDayBoard, type LeanBoard, type LeanStock } from "../api/dayBoard.js";

export interface LeanSnapshot {
    code: string;
    rate: number; // 등락률 %(t 종가)
    openPct: number; // = 첫 종가 기준? → 당일 시가% 는 서버가 안 주므로 t=0 근사 대신 base 대비 첫 close 로 대체하지 않음
    highPct: number; // t 까지 고가 %
    lowPct: number; // t 까지 저가 %
    cumAmount: number; // t 까지 누적 거래대금(원)
    bigCount: number; // t 까지 큰 거래대금 분봉 수(≥30억)
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

/** 시점 t의 종목 스냅샷. t 이전 데이터 없으면 null(아직 미개장). openPct=당일 시가(첫 close 아님)% = close[0] 기준. */
export function leanSnapshotAt(s: LeanStock, t: number): LeanSnapshot | null {
    const i = lastIndexAtOrBefore(s.times, t);
    if (i < 0) return null;
    const base = s.base;
    const pct = (p: number): number => ((p - base) / base) * 100;
    return {
        code: s.code,
        rate: pct(s.close[i]),
        openPct: pct(s.close[0]), // 당일 시가 근사 = 첫 분봉 종가(시가 미보관). 눕힌캔들 몸통 기준.
        highPct: pct(s.high[i]),
        lowPct: pct(s.low[i]),
        cumAmount: s.cumAmount[i],
        bigCount: s.bigCount[i],
    };
}

/** 유니버스 전체의 시간 경계(스크러버 범위 힌트). */
export function boardTimeBounds(board: LeanBoard): { start: number; end: number } {
    let start = Number.POSITIVE_INFINITY;
    let end = 0;
    for (const s of board.stocks) {
        if (s.times.length === 0) continue;
        start = Math.min(start, s.times[0]);
        end = Math.max(end, s.times[s.times.length - 1]);
    }
    return { start: Number.isFinite(start) ? start : 0, end };
}

// 역사 데이터 immutable → staleTime∞, gcTime 넉넉(브라우저 ~10거래일 캐시). 차트/보드 무관 별 캐시키.
export function useDayBoard(date: string): UseQueryResult<LeanBoard> {
    return useQuery({
        queryKey: ["day-board", date],
        queryFn: () => fetchDayBoard(date),
        enabled: date.length > 0,
        staleTime: Infinity,
        gcTime: 60 * 60_000,
    });
}

/** byCode 인덱스(스냅샷 조회용) memo. */
export function useLeanIndex(board: LeanBoard | undefined): Map<string, LeanStock> | null {
    return useMemo(() => {
        if (!board) return null;
        return new Map(board.stocks.map((s) => [s.code, s]));
    }, [board]);
}
