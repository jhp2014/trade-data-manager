// 캔들 오버레이의 앵커 재료 — 짚은 (종목,날)의 **원주가 UN 분봉** 한 벌.
//
// **왜 복기 스냅샷을 안 쓰나**: 스냅샷에도 분당 OHLC 가 있지만 그건 % 공간이고 분모가 복기 기준가
// (원주가 + 이벤트 보정)다. 골격 피벗은 원주가에서 해소되므로, 액분·감자가 낀 종목에서 둘이 갈려
// **손으로 찍은 점이 자기 캔들 밖에 뜬다**. 주인공에서 그 그림이 나오면 골격 자체가 의심받는다.
// 배경(테마 멤버)은 스냅샷 그대로 쓴다 — 거긴 왕복 0이 더 값어치 있고 미세 오차는 이미 수용한 것.
//
// **왜 오버레이가 켜졌을 때만 받나**(사용자 확정): 응답은 하루치 ~400봉(수십 KB)이라 스냅샷(15MB)에
// 비하면 싸지만, 꺼져 있을 때 미리 받아 두면 **쓰지도 않을 요청이 클릭마다** 나간다. 켜져 있을 때만
// 받으면 요청 수가 "켠 상태에서 누른 횟수"로 묶이고, 오간 것들은 아래 LRU 가 즉시 돌려준다.
import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { fetchRankMinutes, type RankDayMinutes } from "../../api/rankMinutes.js";
import { histStale } from "../../api/queries.js";

/** 동시에 들고 있을 (종목,날) 수. 하나가 수십 KB라 스냅샷 캐시(4일)보다 넉넉히 잡는다. */
const CAP = 20;

const keyOf = (chartKey: string): unknown[] => ["skeleton-anchor-minutes", chartKey];

/** 마운트된 소비자가 지금 쓰는 키(참조 수) — 0인 것만 버린다(쓰는 중인 걸 버리면 즉시 재요청된다). */
const inUse = new Map<string, number>();
/** 최근 사용 순(앞이 최신). 버릴 후보를 뒤에서 고른다. */
let recent: string[] = [];

/**
 * `chart` 가 null 이면 요청하지 않는다(오버레이 꺼짐·짚은 선 없음).
 * 캐시 관리는 useDaySnapshot 과 같은 꼴 — 시간이 아니라 **개수**로 상한을 둔다(빠르게 순회할 때
 * 시간 기반은 상한이 없다). 두 훅이 규칙을 공유하는 게 아니라 각자 상한이 다를 뿐이다.
 */
export function useAnchorMinutes(chart: { stockCode: string; date: string; key: string } | null): UseQueryResult<RankDayMinutes> {
    const qc = useQueryClient();
    const cacheKey = chart?.key ?? "";

    useEffect(() => {
        if (!cacheKey) return;
        inUse.set(cacheKey, (inUse.get(cacheKey) ?? 0) + 1);
        recent = [cacheKey, ...recent.filter((k) => k !== cacheKey)];
        for (let i = recent.length - 1; i >= 0 && recent.length > CAP; i--) {
            const k = recent[i];
            if ((inUse.get(k) ?? 0) > 0) continue;
            qc.removeQueries({ queryKey: keyOf(k) });
            recent.splice(i, 1);
        }
        return () => {
            const n = (inUse.get(cacheKey) ?? 1) - 1;
            if (n <= 0) inUse.delete(cacheKey);
            else inUse.set(cacheKey, n);
        };
    }, [cacheKey, qc]);

    return useQuery({
        queryKey: keyOf(cacheKey),
        // 배치 엔드포인트에 1건만 — 이 화면은 언제나 "짚은 하나"라 묶을 게 없다(테마 규칙과 같은 갈래).
        queryFn: async () => (await fetchRankMinutes([{ stockCode: chart!.stockCode, date: chart!.date }]))[0]
            ?? { stockCode: chart!.stockCode, date: chart!.date, bars: [] },
        enabled: !!chart,
        staleTime: chart ? histStale(chart.date) : 0,
        gcTime: Infinity, // 위 LRU 가 개수로 관리한다
    });
}
