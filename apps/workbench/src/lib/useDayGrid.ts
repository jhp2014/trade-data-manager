// 그날 날짜 격자(전 종목, 1%) — 하루 타점 술어(① 기준선 돌파 ② 마디 재돌파)의 재료.
//
// 키를 날짜별로 두고 **개수 상한 LRU** 로 버린다 — `useDaySnapshot` 과 같은 이유(날짜를 오가며 짚는 소비자라
// 시간 만료로 잡으면 순회할 때 상한이 없다). 번들이 스냅샷보다 한 자릿수 작아(~1.2MB) 상한은 같게 둔다.
// ⚠ LRU 몸통이 useDaySnapshot 과 사본이다 — 셋째 소비자가 생기면 팩토리로 올린다(둘일 땐 읽기 쉬운 쪽).
import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { fetchDayGrids, type DecodedDayGrids } from "../api/dayGrids.js";
import { histStale } from "../api/queries.js";

const CAP = 6;
const keyOf = (date: string): unknown[] => ["day-grid-lru", date];
const inUse = new Map<string, number>();
let recent: string[] = [];

/** `date` 가 null 이면 요청하지 않는다(하루 타점 술어를 안 쓰면 재료를 안 당긴다). */
export function useDayGrid(date: string | null): UseQueryResult<DecodedDayGrids> {
    const qc = useQueryClient();
    useEffect(() => {
        if (!date) return;
        inUse.set(date, (inUse.get(date) ?? 0) + 1);
        recent = [date, ...recent.filter((d) => d !== date)];
        for (let i = recent.length - 1; i >= 0 && recent.length > CAP; i--) {
            const d = recent[i]!;
            if ((inUse.get(d) ?? 0) > 0) continue;
            qc.removeQueries({ queryKey: keyOf(d) });
            recent.splice(i, 1);
        }
        return () => {
            const n = (inUse.get(date) ?? 1) - 1;
            if (n <= 0) inUse.delete(date);
            else inUse.set(date, n);
        };
    }, [date, qc]);

    return useQuery({
        queryKey: keyOf(date ?? ""),
        queryFn: ({ signal }) => fetchDayGrids(date!, signal),
        enabled: !!date,
        staleTime: date ? histStale(date) : 0,
        gcTime: Infinity,
    });
}
