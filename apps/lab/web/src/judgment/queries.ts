// 판단 저장소 훅 — 이력 읽기(react-query). 이력은 하루 한 번 쌓이니 잠깐 신선하다고 보고, 창에 돌아오면 다시 읽는다.
import { useQuery } from "@tanstack/react-query";
import { useJudgment } from "./JudgmentProvider.js";

const FRESH_MS = 60_000;

/** 그날 이전 이력으로 종목 → 테마들. */
export function useHistoryThemes(date: string) {
    const store = useJudgment();
    return useQuery({
        queryKey: ["history-themes", date],
        queryFn: ({ signal }) => store.historyThemes(date, signal),
        enabled: date !== "",
        staleTime: FRESH_MS,
    });
}

/** 한 종목의 이력(없으면 null). code 가 빈 문자열이면 묻지 않는다. */
export function useStockHistory(code: string, date: string) {
    const store = useJudgment();
    return useQuery({
        queryKey: ["stock-history", code, date],
        queryFn: ({ signal }) => store.stockHistory(code, date, signal),
        enabled: code !== "" && date !== "",
        staleTime: FRESH_MS,
    });
}
