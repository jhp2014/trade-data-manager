// 그날 분봉 파생 소스(공용 lib) — 소비자: 정규화 패널(테마·거래대금)·테마 순위 패널(스크럽 단면) — /day-replay 한 벌(거래대금 구간값 + 테마 선의 재료).
//
// **왜 복기 보드와 캐시를 안 나누는가**(별도 쿼리 키): 응답 하나가 압축 해제 기준 ~15MB(536종목 × 720분)다.
// 복기 보드는 이걸 `["day-replay", date]` 에 gcTime 60분으로 잡아 두는데, 이쪽 소비자(정규화·테마 순위)는 짚을 때마다
// **날짜가 바뀐다** — 같은 키를 쓰면 react-query 가 옵저버 중 **최대 gcTime** 을 쓰므로 60분이 이기고,
// 스무 개를 짚어보는 동안 화면엔 하나인데 힙엔 스무 날이 앉는다. 키를 갈라 우리가 직접 버린다.
// 캐시를 비울 때 복기 보드가 보던 날짜를 같이 날리는 사고도 이 분리로 막힌다(같은 날짜 두 벌은 감수).
//
// **왜 1개가 아니라 3~4개인가**: 1개만 남기면 선을 왔다 갔다 할 때마다 매번 받아서 파싱한다(클릭당 수백 ms).
// 최근 것들 사이를 오가는 건 즉시 뜨고 힙은 상한이 있는, 그 사이의 값이 CAP 이다.
import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { fetchDayReplay, type DayReplay } from "../api/dayReplay.js";
import { histStale } from "../api/queries.js";

/** 동시에 들고 있을 날짜 수. 힙 = 이 값 × ~15MB 가 상한이다.
 *  6 인 이유: 현재 + **프리페치 앞뒤 2** + 직전 시선 1 + 여유 1(4 면 프리페치가 제 앞 날짜를 밀어낸다). */
const CAP = 6;

const keyOf = (date: string): unknown[] => ["day-replay-lru", date]; // 메모리 전용 키 — 옛 "skeleton-day-src"(은퇴한 골격 패널의 이름)에서 개명

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

/**
 * 이웃 날짜 **미리 당기기** — 날짜 경계 넘기(w/s)가 한 손짓인데 수백 ms 공백이 끼면 순회가 끊긴다.
 *
 * ⚠ 프리페치한 날짜도 **LRU 에 등록**한다(`recent`) — 안 하면 `gcTime: Infinity` 라 캐시에 영구
 * 잔류해서 한 날 ~15MB 가 조용히 쌓인다. 반대로 `inUse` 에는 **안** 넣는다: 쓰는 중이 아니므로
 * 상한이 넘치면 먼저 버려져야 한다.
 *
 * 취소: 날짜가 바뀌면 (a) 대기 중인 idle 예약을 걷고 (b) 더 이상 이웃이 아닌 날짜의 in-flight 을
 * 끊는다(`fetchDayReplay` 가 signal 을 받으므로 실제로 끊긴다). 안 끊으면 a/d 연타가 요청을 쌓는다.
 *
 * **후보 계산은 미리 하지 않는다**(설계) — 재료만 당긴다.
 */
export function useDayReplayPrefetch(date: string | null, neighbors: readonly string[]): void {
    const qc = useQueryClient();
    const key = neighbors.join(",");
    useEffect(() => {
        if (!date || neighbors.length === 0) return;
        const targets = neighbors.filter((d) => d !== date);
        const idle = (cb: () => void): number =>
            typeof requestIdleCallback === "function"
                ? (requestIdleCallback(cb) as unknown as number)
                : (setTimeout(cb, 0) as unknown as number);
        const cancelIdle = (h: number): void => {
            if (typeof cancelIdleCallback === "function") cancelIdleCallback(h as unknown as number);
            else clearTimeout(h);
        };
        const handle = idle(() => {
            for (const d of targets) {
                recent = [...recent.filter((x) => x !== d), d]; // 뒤쪽(먼저 버려지는 자리)에 등록
                void qc.prefetchQuery({
                    queryKey: keyOf(d),
                    queryFn: ({ signal }) => fetchDayReplay(d, signal),
                    staleTime: histStale(d),
                    gcTime: Infinity,
                });
            }
        });
        return () => {
            cancelIdle(handle);
            // ⚠ 판정을 **한 틱 미룬다** — React 는 커밋의 cleanup 을 전부 돌린 뒤 setup 을 돌리므로,
            //   여기서 바로 보면 새 날짜의 useDaySnapshot 이 아직 inUse 를 안 올렸다. 그대로 끊으면
            //   w/s 로 막 넘어간 그 날짜의 프리페치(15MB)가 abort 되고 직후 처음부터 다시 받는다.
            setTimeout(() => {
                for (const d of targets) if ((inUse.get(d) ?? 0) === 0) void qc.cancelQueries({ queryKey: keyOf(d) });
            }, 0);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, key, qc]);
}
