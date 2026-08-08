// 순위 필터 경로 조립 — (종목,날) raw UN 분봉을 세션 캐시에 모으고, 타점별 진입가 앵커 경로를 클라에서 만든다.
//  · 핵심: 캐시 단위가 "집합 통째"가 아니라 **(종목,날)** 이라, 필터를 좁히면(부분집합) 서버 재조회 0.
//    넓히면 캐시에 없는 날만 배치로 델타 조회. 정규화 규칙은 core/market(entryAnchoredBars) 단일 출처.
//  · dayCache = 모듈 전역 Map(세션 한정). 새로고침 시 해제. LRU 없음(메모리는 수천 일까지 여유, 상세는 논의 기록).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entryAnchoredBars } from "@trade-data-manager/market/domain";
import { fetchRankMinutes, type RankMinuteBar } from "../../api/rankMinutes.js";
import type { RankPoint } from "../../api/rank.js";
import type { RankPointPath } from "../../api/rankPaths.js";
import { chartKeyOf } from "../../lib/pointKey.js";

const dayKey = chartKeyOf; // (종목,날) = 차트 키 — 손조립 대신 공용 계약
const dayCache = new Map<string, RankMinuteBar[]>(); // (종목,날) → 시간오름차 UN 분봉. 데이터 없는 날 = 빈 배열(재조회 방지).

export interface RankPathsResult {
    paths: RankPointPath[];
    isLoading: boolean;
}

export function useRankPaths(points: RankPoint[]): RankPathsResult {
    // 필요한 고유 (종목,날). 같은 날 여러 타점은 분봉 1벌 공유.
    const days = useMemo(() => {
        const m = new Map<string, { stockCode: string; date: string }>();
        for (const p of points) m.set(dayKey(p.stockCode, p.date), { stockCode: p.stockCode, date: p.date });
        return [...m.values()];
    }, [points]);
    const setId = useMemo(() => days.map((d) => dayKey(d.stockCode, d.date)).sort().join(","), [days]);

    // 이 집합에 필요한 날 중 캐시에 없는 것만 배치로 받아 캐시에 심는다. 부분집합이면 missing=0 → 네트워크 없음.
    const ensureQ = useQuery({
        queryKey: ["rank-minutes", setId],
        enabled: days.length > 0,
        staleTime: Infinity,
        queryFn: async () => {
            const missing = days.filter((d) => !dayCache.has(dayKey(d.stockCode, d.date)));
            if (missing.length > 0) {
                const res = await fetchRankMinutes(missing);
                const got = new Set<string>();
                for (const d of res) {
                    dayCache.set(dayKey(d.stockCode, d.date), d.bars);
                    got.add(dayKey(d.stockCode, d.date));
                }
                for (const d of missing) {
                    const k = dayKey(d.stockCode, d.date);
                    if (!got.has(k)) dayCache.set(k, []); // 서버가 안 준 날 = 빈 배열(재조회 방지)
                }
            }
            return setId;
        },
    });

    const ready = ensureQ.data === setId; // 이 집합의 날들이 전부 캐시에 준비됨
    const paths = useMemo<RankPointPath[]>(() => {
        if (points.length === 0 || !ready) return [];
        return points.map((p) => ({
            stockCode: p.stockCode,
            date: p.date,
            time: p.time,
            bars: entryAnchoredBars(dayCache.get(dayKey(p.stockCode, p.date)) ?? [], p.time),
        }));
    }, [points, ready]);

    // 로딩은 isPending 기준 — 에러(예: MAX_DAYS 초과) 시 무한 로딩 대신 빈 결과로 떨어진다.
    return { paths, isLoading: days.length > 0 && ensureQ.isPending };
}
