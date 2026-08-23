// 골격 패널의 그날 분봉 파생 소스 — /day-replay 한 벌(거래대금 구간값 + 테마 선의 재료).
//
// **왜 복기 보드와 캐시를 안 나누는가**(별도 쿼리 키): 응답 하나가 압축 해제 기준 ~15MB(536종목 × 720분)다.
// 복기 보드는 이걸 `["day-replay", date]` 에 gcTime 60분으로 잡아 두는데, 골격 패널은 선을 짚을 때마다
// **날짜가 바뀐다** — 같은 키를 쓰면 react-query 가 옵저버 중 **최대 gcTime** 을 쓰므로 60분이 이기고,
// 스무 개를 짚어보는 동안 화면엔 하나인데 힙엔 스무 날이 앉는다. 키를 갈라 우리가 직접 버린다.
// 캐시를 비울 때 복기 보드가 보던 날짜를 같이 날리는 사고도 이 분리로 막힌다(같은 날짜 두 벌은 감수).
//
// **왜 1개가 아니라 3~4개인가**: 1개만 남기면 선을 왔다 갔다 할 때마다 매번 받아서 파싱한다(클릭당 수백 ms).
// 최근 것들 사이를 오가는 건 즉시 뜨고 힙은 상한이 있는, 그 사이의 값이 CAP 이다.
import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { fetchDayReplay, type DayReplay } from "../../api/dayReplay.js";
import { histStale } from "../../api/queries.js";

/** 동시에 들고 있을 날짜 수. 힙 = 이 값 × ~15MB 가 상한이다. */
const CAP = 4;

const keyOf = (date: string): unknown[] => ["skeleton-day-src", date];

/** 마운트된 소비자가 지금 쓰는 날짜(참조 수) — 0인 것만 버린다(쓰는 중인 걸 버리면 즉시 재요청된다). */
const inUse = new Map<string, number>();
/** 최근 사용 순(앞이 최신). 버릴 후보를 뒤에서 고른다. */
let recent: string[] = [];

/**
 * 그날 복기 파생. `date` 가 null 이면 요청하지 않는다(짚은 선이 없을 때 빈 화면이 데이터를 당기지 않게).
 * 마운트/날짜 변경마다 LRU 를 갱신하고 상한을 넘은 **미사용** 날짜를 캐시에서 지운다.
 */
export function useDaySnapshot(date: string | null): UseQueryResult<DayReplay> {
    const qc = useQueryClient();

    useEffect(() => {
        if (!date) return;
        inUse.set(date, (inUse.get(date) ?? 0) + 1);
        recent = [date, ...recent.filter((d) => d !== date)];
        // 뒤(오래된 것)부터, 쓰는 중이 아닌 날짜를 상한까지 버린다.
        for (let i = recent.length - 1; i >= 0 && recent.length > CAP; i--) {
            const d = recent[i];
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
        queryFn: ({ signal }) => fetchDayReplay(date!, signal),
        enabled: !!date,
        staleTime: date ? histStale(date) : 0,
        // 시간 기반 만료는 안 쓴다 — 위 LRU 가 개수로 관리한다(시간으로 잡으면 빠르게 순회할 때 상한이 없다).
        gcTime: Infinity,
    });
}
