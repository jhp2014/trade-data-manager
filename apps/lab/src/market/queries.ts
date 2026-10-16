// 시장 데이터 훅 — react-query 캐시 위에서 창구(ports)를 부른다. 패널은 이 훅만 안다.
import { useEffect, useMemo } from "react";
import { keepPreviousData, queryOptions, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import { kstToday } from "./domain.js";
import { useCalendarData, useChartData, useStockData, useThemeData } from "./MarketProvider.js";
import type { ChartBundle, DayReplay } from "./types.js";
import type { ChartData } from "./ports.js";

const TODAY_STALE = 60_000; // 오늘 시세는 수집이 채우는 중일 수 있다 — 1분 뒤 재조회 허용
const META_STALE = 30 * 60_000; // 종목 마스터 — 새 종목이 세션 내내 안 보이지 않게

/** 과거 날짜 시세는 바뀌지 않는다. */
const histStale = (date: string): number => (date < kstToday() ? Infinity : TODAY_STALE);

/**
 * 일봉 2년 + 그 날 분봉. 종목·날짜가 다 있어야 부른다. 같은 (종목, 날짜)는 패널이 여럿이어도 요청 한 번.
 * 키가 바뀌면 새 데이터가 올 때까지 직전 데이터를 준다(isPlaceholderData) — 차트가 로딩으로 언마운트되지 않게.
 */
export function useChartBundle(code: string, date: string): UseQueryResult<ChartBundle, Error> {
    const port = useChartData();
    return useQuery({ ...chartBundleQuery(port, code, date), enabled: code !== "" && date !== "", placeholderData: keepPreviousData });
}

/** (종목, 날짜) 번들 조회 정의 — 차트 패널과 차트 단축키(패널이 없어도 받는다)가 같은 캐시를 쓴다. */
export const chartBundleQuery = (port: ChartData, code: string, date: string) =>
    queryOptions({ queryKey: ["chart", code, date], queryFn: ({ signal }) => port.chart(code, date, signal), staleTime: histStale(date) });

/** 종목명 찾기 — 코드 → 이름. 모르는 코드거나 마스터를 아직 못 받았으면 null. 목록처럼 여러 코드를 볼 때. */
export function useStockNameOf(): (code: string) => string | null {
    const port = useStockData();
    const q = useQuery({
        queryKey: ["stock-master"],
        queryFn: ({ signal }) => port.stockMaster(signal),
        staleTime: META_STALE,
    });
    return useMemo(() => {
        const byCode = new Map((q.data ?? []).map((m) => [m.stockCode, m.name]));
        return (code: string) => byCode.get(code) ?? null;
    }, [q.data]);
}

/** 거래일 목록(오름차순) — 날짜는 여기 있는 날만 고른다. 저녁 수집분이 들어오도록 종목 마스터와 같은 주기로 다시 묻는다. */
export function useTradingDays(): UseQueryResult<string[], Error> {
    const port = useCalendarData();
    return useQuery({ queryKey: ["trading-days"], queryFn: ({ signal }) => port.tradingDays(signal), staleTime: META_STALE });
}

/** 종목명 하나. */
export function useStockName(code: string): string | null {
    return useStockNameOf()(code);
}

/** 메모리에 남길 /day-replay 날짜 수 — 하루 ~23MB. 지금 화면에 떠 있는 날짜는 수와 상관없이 남는다. */
export const DAY_REPLAY_KEEP = 4;
const dayReplayUsedAt = new Map<string, number>();

/**
 * 최근 본 날짜 keep 개만 남기고 나머지 /day-replay 캐시를 지운다 — 보고 있는(구독 중인) 날짜는 지우지 않는다.
 * 지운 날짜로 돌아가면 다시 받는다(서버가 과거 날짜를 파일 캐시로 두어 ~1초).
 */
export function pruneDayReplays(qc: QueryClient, keep = DAY_REPLAY_KEEP, usedAt: ReadonlyMap<string, number> = dayReplayUsedAt): void {
    const queries = qc.getQueryCache().findAll({ queryKey: ["day-replay"] });
    if (queries.length <= keep) return;
    const dateOf = (q: (typeof queries)[number]): string => String(q.queryKey[1]);
    const ranked = [...queries].sort((a, b) => (usedAt.get(dateOf(b)) ?? 0) - (usedAt.get(dateOf(a)) ?? 0));
    for (const q of ranked.slice(keep)) if (q.getObserversCount() === 0) qc.removeQueries({ queryKey: q.queryKey, exact: true });
}

/**
 * 그날 전 종목 분당 시계열 + 테마 소속 — 크다(메모리 하루 ~23MB). 같은 날짜는 패널이 여럿이어도 한 번 받고,
 * 최근 본 날짜 DAY_REPLAY_KEEP 개까지 남긴다(두세 날짜를 오가며 비교해도 다시 받지 않게). 날짜가 바뀌는 동안 직전 날을 보여 준다.
 */
export function useDayReplay(date: string): UseQueryResult<DayReplay, Error> {
    const port = useThemeData();
    const qc = useQueryClient();
    useEffect(() => {
        if (!date) return;
        dayReplayUsedAt.set(date, Date.now());
        pruneDayReplays(qc);
    }, [date, qc]);
    return useQuery({
        queryKey: ["day-replay", date],
        queryFn: ({ signal }) => port.dayReplay(date, signal),
        enabled: date !== "",
        staleTime: histStale(date),
        gcTime: 60 * 60_000,
        placeholderData: keepPreviousData,
    });
}
