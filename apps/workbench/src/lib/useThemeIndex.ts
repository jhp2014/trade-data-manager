// 테마↔종목 양방향 인덱스 — 시트 멤버십 전량(theme-members-all) 위에 core buildThemeIndex 를 접는 훅.
// 인덱스 로직은 core 한 벌(서버 1차 분류기와 같은 함수)이고 여긴 RQ 캐시 + memo 겉옷만.
// **읽기 시점 현재 상태**다 — 테마 강도류 파생에 멤버십을 굽지 않는다는 확정 설계의 클라 쪽 절반
// (시트를 고치면 다음 로드가 새 무리를 본다. 30분 stale + 배정/refresh invalidate).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildThemeIndex, type ThemeIndex } from "@trade-data-manager/market/domain";
import { allThemeMembersQuery } from "../api/queries.js";

const EMPTY_INDEX: ThemeIndex = buildThemeIndex([]);

/**
 * **모듈 1-엔트리 캐시**(키 = RQ data 참조) — 인덱스는 앱에 한 벌이어야 한다. `useMemo` 만 쓰면
 * 컴포넌트 인스턴스마다 다른 객체가 서고, 그 참조를 키로 삼는 하류 캐시(useThemeProjection)가
 * 소비자 수만큼 미스를 낸다(= 모수 전체를 도는 패스가 화면 수만큼 돈다).
 */
let cache: { data: unknown; index: ThemeIndex } | null = null;
const indexOf = (data: Parameters<typeof buildThemeIndex>[0]): ThemeIndex => {
    if (!cache || cache.data !== data) cache = { data, index: buildThemeIndex(data) };
    return cache.index;
};

export interface ThemeIndexView {
    index: ThemeIndex;
    isLoading: boolean;
    /**
     * 데이터가 실제로 도착했나 — isLoading 만으로는 못 가른다(RQ v5 의 paused 등 "pending 인데
     * fetching 아님" 상태에서 isLoading=false·data=undefined). 판정 소비자(깔때기)는 이걸로 투영을
     * null(판단 불가)로 접어야 빈 인덱스가 "테마 없음 = 전부 탈락"으로 위장하지 않는다.
     */
    ready: boolean;
    /** 첫 로드 실패 — 빈 인덱스를 "테마 없음"으로 오독하지 않게 겉으로 낸다. */
    error: Error | null;
}

export function useThemeIndex(): ThemeIndexView {
    const q = useQuery(allThemeMembersQuery());
    return useMemo(
        () => ({
            index: q.data ? indexOf(q.data) : EMPTY_INDEX,
            isLoading: q.isLoading,
            ready: q.data !== undefined,
            error: (q.error as Error | null) ?? null,
        }),
        [q.data, q.isLoading, q.error],
    );
}
