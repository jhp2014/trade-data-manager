// 시장 데이터 훅 — react-query 캐시 위에서 창구(ports)를 부른다. 패널은 이 훅만 안다.
import { useEffect, useMemo, useRef } from "react";
import {
    keepPreviousData,
    queryOptions,
    useInfiniteQuery,
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
    type InfiniteData,
    type QueryClient,
    type UseInfiniteQueryResult,
    type UseQueryResult,
} from "@tanstack/react-query";
import { kstToday } from "./domain.js";
import { addDays, shiftYears } from "../lib/date.js";
import { ApiError } from "./http.js";
import { useCalendarData, useChartData, useLineData, useStockData, useThemeData } from "./MarketProvider.js";
import type { DayFlow, LabChartLine, LabDailyCandle, LabMinuteDay, StockMarketCapPoint, StockMoves } from "./types.js";
import type { ChartData } from "./ports.js";

const TODAY_STALE = 60_000; // 오늘 시세는 수집이 채우는 중일 수 있다 — 1분 뒤 재조회 허용
const META_STALE = 30 * 60_000; // 종목 마스터 — 새 종목이 세션 내내 안 보이지 않게

/** 과거 날짜 시세는 바뀌지 않는다. */
const histStale = (date: string): number => (date < kstToday() ? Infinity : TODAY_STALE);

/**
 * 차트 시세의 자리 채움 — 같은 종목(키의 둘째 칸)이면 새 데이터가 올 때까지 직전 데이터를 잇고, 종목이 바뀌면 비운다.
 * 날짜만 바뀔 땐 차트를 언마운트하지 않아 줌이 안 깨지고, 종목이 바뀔 땐 옛 종목 차트를 새 종목으로 오독하지 않는다
 * (토큰을 붙인 뒤 처음 보는 종목의 일봉이 오는 0.6~1초 동안 머리글만 새 종목이던 일).
 */
export const keepSameStock =
    (code: string) =>
    <T>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }): T | undefined =>
        prevQuery?.queryKey[1] === code ? prev : undefined;

/** 일봉 한 덩이(년) — 처음엔 경로 날짜에서 이만큼, 왼쪽으로 끌 때마다 이만큼씩 더 받는다. */
export const DAILY_CHUNK_YEARS = 2;

/** 일봉 한 덩이 — [from, to] 양 끝 포함. rows 가 비면 그 앞으로는 더 없다(상장 전). */
export interface DailyPage {
    from: string;
    to: string;
    rows: LabDailyCandle[];
}

/**
 * 일봉 — 경로 날짜(to)에서 끝나고, fetchNextPage 마다 그 앞 DAILY_CHUNK_YEARS 년을 더 받는다(차트를 왼쪽으로 끌 때).
 * 같은 종목에서 날짜가 바뀌면 새 데이터가 올 때까지 직전 데이터를 준다(isPlaceholderData — 차트가 로딩으로 언마운트되지 않게). 종목이 바뀌면 비운다(keepSameStock).
 * 이어 붙인 오름차순 봉은 dailyRowsOf 로.
 */
export function useDailyCandles(code: string, date: string): UseInfiniteQueryResult<InfiniteData<DailyPage, string>, Error> {
    const port = useChartData();
    return useInfiniteQuery({
        queryKey: ["daily", code, date],
        initialPageParam: date,
        queryFn: async ({ pageParam: to, signal }) => {
            const from = shiftYears(to, -DAILY_CHUNK_YEARS);
            return { from, to, rows: await port.daily(code, from, to, signal) };
        },
        getNextPageParam: (last) => (last.rows.length === 0 ? undefined : addDays(last.from, -1)),
        enabled: code !== "" && date !== "",
        staleTime: histStale(date),
        placeholderData: keepSameStock(code),
    });
}

/** 받은 덩이들 → 날짜 오름차순 봉 하나로(덩이는 최근부터 쌓인다). */
export const dailyRowsOf = (data: InfiniteData<DailyPage, string> | undefined): LabDailyCandle[] =>
    data ? data.pages.slice().reverse().flatMap((p) => p.rows) : [];

/** (종목, 날짜) 분봉 조회 정의 — 차트 패널과 차트 단축키(패널이 없어도 받는다)가 같은 캐시를 쓴다. */
export const minuteDayQuery = (port: ChartData, code: string, date: string) =>
    queryOptions({ queryKey: ["minutes", code, date], queryFn: ({ signal }) => port.minutes(code, date, signal), staleTime: histStale(date) });

/** 경로 날짜의 분봉 — 같은 종목이면 새 데이터가 올 때까지 직전 데이터를 준다(isPlaceholderData), 종목이 바뀌면 비운다(keepSameStock). */
export function useMinuteDay(code: string, date: string): UseQueryResult<LabMinuteDay, Error> {
    const port = useChartData();
    return useQuery({ ...minuteDayQuery(port, code, date), enabled: code !== "" && date !== "", placeholderData: keepSameStock(code) });
}

/** 여러 날 분봉의 한 날 — 아직 안 왔으면 data·failed 둘 다 비어 있다. */
export interface MinuteDayResult {
    data: LabMinuteDay | undefined;
    failed: boolean;
}

/** 여러 날 분봉(이어 보기 — 「가격」 모드). dates 순서 그대로 돌려준다. */
export function useMinuteDays(code: string, dates: readonly string[]): MinuteDayResult[] {
    const port = useChartData();
    return useQueries({
        queries: dates.map((d) => ({ ...minuteDayQuery(port, code, d), enabled: code !== "" })),
        combine: (rs) => rs.map((r) => ({ data: r.data, failed: r.isError })),
    });
}

/**
 * lab 저장 선 — 그 차트(종목, 날짜)의 선 + 저장·지우기. 쓰기는 서버가 돌려준 **그 쓰기의 차트** 목록으로 캐시를 바로 갈아 끼운다
 * (다시 묻지 않는다 — 저장소는 이 서버 하나만 쓴다). 응답을 기다리는 사이 경로가 바뀌어도 새 차트 캐시를 덮지 않게 키는 쓰기 변수에서 만든다.
 * 쓰는 중엔 current 가 false — 옛 종류로 판단한 칩 조작이 겹치지 않게. 실패는 error 로(차트 정보에 알림, 경로가 바뀌면 걷힌다).
 */
export function useChartLines(code: string, date: string): {
    lines: LabChartLine[];
    /** 지금 경로의 선인가(경로가 바뀌어 기다리는 동안은 false — 그동안 칩 조작을 막는다). */
    current: boolean;
    save: (line: LabChartLine) => void;
    remove: (line: LabChartLine) => void;
    error: Error | null;
} {
    const port = useLineData();
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ["chart-lines", code, date], queryFn: ({ signal }) => port.chartLines(code, date, signal), enabled: code !== "" && date !== "", staleTime: Infinity });
    type Write = { code: string; line: LabChartLine };
    const onSuccess = (lines: LabChartLine[], v: Write) => qc.setQueryData(["chart-lines", v.code, v.line.chartDate], lines);
    const save = useMutation({ mutationFn: (v: Write) => port.saveChartLine(v.code, v.line), onSuccess });
    const remove = useMutation({ mutationFn: (v: Write) => port.deleteChartLine(v.code, v.line), onSuccess });
    // 경로가 바뀌면 지난 오류만 걷는다 — 진행 중인 쓰기는 두어야 isPending 막음이 산다(되돌아와도 칩이 먼저 열리지 않게)
    const resets = useRef({ save, remove });
    resets.current = { save, remove };
    useEffect(() => {
        for (const m of [resets.current.save, resets.current.remove]) if (!m.isPending) m.reset();
    }, [code, date]);
    return {
        lines: q.data ?? [],
        current: q.data !== undefined && !q.isPlaceholderData && !save.isPending && !remove.isPending,
        save: (line) => save.mutate({ code, line }),
        remove: (line) => remove.mutate({ code, line }),
        error: q.error ?? save.error ?? remove.error ?? null,
    };
}

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

/** 그날 아침 시총을 찾아볼 달력 일수 — 휴장·늦은 수집 대비. */
const MORNING_CAP_LOOKBACK_DAYS = 20;

/** D 의 아침 시총 — date < D 인 마지막 줄(D 줄은 그날 종가라 그날 등락이 섞인다 — 결정 로그 「시가총액·상장주식수 소스 (KRX)」). 없으면 null. */
export const morningCapOf = (rows: readonly StockMarketCapPoint[], date: string): string | null => rows.filter((r) => r.date < date).at(-1)?.cap ?? null;

/**
 * 그 종목의 D 아침 시총(원, KRX 원값 문자열). 모르면 null — 불러오는 중·실패·값 없음(2024-07 전 등)을 가르지 않는다(차트 옆 정보일 뿐).
 * 같은 종목이면 새 값이 올 때까지 직전 값을 잇고(자리가 깜박이지 않게), 종목이 바뀌면 비운다(옛 종목 시총을 새 종목으로 오독하지 않게).
 */
export function useMorningCap(code: string, date: string): string | null {
    const port = useStockData();
    const q = useQuery({
        queryKey: ["marketcap", code, date],
        queryFn: ({ signal }) => port.marketCaps(code, addDays(date, -MORNING_CAP_LOOKBACK_DAYS), addDays(date, -1), signal),
        enabled: code !== "" && date !== "",
        staleTime: histStale(date),
        placeholderData: keepSameStock(code),
    });
    return morningCapOf(q.data ?? [], date);
}

/**
 * 그 종목의 움직인 날(tdm-ai 이력, /theme/stocks). asOf 를 주면 서버가 date <= asOf(당일 포함)로 자른다.
 * 이력 없는 종목은 404(ApiError) — 오류가 아니라 "이력 없음"이므로 재시도하지 않고, 소비 쪽이 status 로 가른다.
 * 저장소는 lab-api 재시작 때만 바뀐다 — 마스터와 같은 주기면 충분.
 */
export function useStockMoves(code: string, asOf?: string): UseQueryResult<StockMoves, Error> {
    const port = useThemeData();
    return useQuery({
        queryKey: ["stock-moves", code, asOf ?? ""],
        queryFn: ({ signal }) => port.stockMoves(code, asOf, signal),
        enabled: code !== "",
        staleTime: META_STALE,
        retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 1,
    });
}

/** 메모리에 남길 /day-flow 날짜 수 — 하루 ~9MB(쓰는 필드만 온다). 지금 화면에 떠 있는 날짜는 수와 상관없이 남는다. */
export const DAY_FLOW_KEEP = 4;
const dayFlowUsedAt = new Map<string, number>();

/**
 * 최근 본 날짜 keep 개만 남기고 나머지 /day-flow 캐시를 지운다 — 보고 있는(구독 중인) 날짜는 지우지 않는다.
 * 지운 날짜로 돌아가면 다시 받는다(서버가 캐시 없이 직계산해 ~3초).
 */
export function pruneDayFlows(qc: QueryClient, keep = DAY_FLOW_KEEP, usedAt: ReadonlyMap<string, number> = dayFlowUsedAt): void {
    const queries = qc.getQueryCache().findAll({ queryKey: ["day-flow"] });
    if (queries.length <= keep) return;
    const dateOf = (q: (typeof queries)[number]): string => String(q.queryKey[1]);
    const ranked = [...queries].sort((a, b) => (usedAt.get(dateOf(b)) ?? 0) - (usedAt.get(dateOf(a)) ?? 0));
    for (const q of ranked.slice(keep)) if (q.getObserversCount() === 0) qc.removeQueries({ queryKey: q.queryKey, exact: true });
}

/**
 * 그날 전 종목 분당 시계열(/day-flow — 테마 소속은 안 실려 온다, 소비하는 쪽이 입힌다) — 크다(하루 ~9MB).
 * 같은 날짜는 패널이 여럿이어도 한 번 받고, 최근 본 날짜 DAY_FLOW_KEEP 개까지 남긴다(두세 날짜를 오가며
 * 비교해도 다시 받지 않게). 날짜가 바뀌는 동안 직전 날을 보여 준다.
 */
export function useDayFlow(date: string): UseQueryResult<DayFlow, Error> {
    const port = useThemeData();
    const qc = useQueryClient();
    useEffect(() => {
        if (!date) return;
        dayFlowUsedAt.set(date, Date.now());
        pruneDayFlows(qc);
    }, [date, qc]);
    return useQuery({
        queryKey: ["day-flow", date],
        queryFn: ({ signal }) => port.dayFlow(date, signal),
        enabled: date !== "",
        staleTime: histStale(date),
        gcTime: 60 * 60_000,
        placeholderData: keepPreviousData,
    });
}
