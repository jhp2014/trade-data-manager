// 테마 강도 통계 — 연동 행의 라이브 카운트(3항). (구 panels/themeRank/useThemeRankCount)
//
// lib 에 사는 이유: 소비자가 패널이지만 그 판정 규칙이 깔때기 술어(themeStrength)와 같은 벌이라,
// panels/themeRank 안에 두면 다른 화면이 이걸 쓰려는 순간 패널 간 의존이 생긴다.
//
// ⚠ **호출자는 하나여야 한다** — 한 패스가 모수 ~수천 × 테마 × 멤버라, 행마다 부르면 행 수만큼
// 곱이 된다(그래서 카운트는 연동 행에만 단다, decisions.md).
//
// **모듈 레벨 1-엔트리 메모**: 캐시 키는 전부 **공유 참조**(RQ 캐시의 points/bundle/멤버십 data)여야
// 한다 — 컴포넌트별로 새로 서는 파생(sectionAt 클로저, useThemeIndex 의 index)을 키에 넣으면
// 컴포넌트 수만큼 미스가 난다. 그래서 멤버십도 여기서 쿼리를 직접 접어 proj 를 모듈 캐시로 공유한다.
//
// 옛 `ticks`(컷 레일 틱: 모수 타점들의 자기 서수·존 순위)는 **폐지** — 소비자였던 보드 테마 카드의
// 컷 레일이 사라지면서(2026-08-29 재편) 아무도 안 읽는데 params 가 바뀔 때마다 전 모수를 다시 돌았다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildThemeIndex } from "@trade-data-manager/market/domain";
import { allThemeMembersQuery } from "../api/queries.js";
import { useAllPoints } from "./useAllPoints.js";
import { useRankSections } from "./useRankSections.js";
import {
    countPassing, themeProjectionOf,
    type SectionRanks, type StrengthCount, type ThemeProjection, type ThemeStrengthParams,
} from "./themeStrength.js";

export interface ThemeStrengthStats extends StrengthCount {
    /** 재료가 아직 안 왔다 — 숫자를 0 으로 오독하지 않게 겉으로 낸다. */
    isLoading: boolean;
    /** 재료 로드 실패 — "통과 0" 으로 위장되지 않게 겉으로 낸다. */
    error: Error | null;
}

type Points = readonly { stockCode: string; date: string; time: string }[];
type SectionAt = (date: string, time: string) => SectionRanks | null;

let projCache: { data: unknown; proj: ThemeProjection } | null = null;
const sharedProjOf = (data: unknown, index: Parameters<typeof themeProjectionOf>[0]): ThemeProjection => {
    if (!projCache || projCache.data !== data) projCache = { data, proj: themeProjectionOf(index) };
    return projCache.proj;
};

let countCache: { points: unknown; bundle: unknown; proj: unknown; key: string; value: StrengthCount } | null = null;
const cachedCount = (points: Points, bundle: unknown, proj: ThemeProjection, params: ThemeStrengthParams, sectionAt: SectionAt): StrengthCount => {
    const key = JSON.stringify(params);
    if (!countCache || countCache.points !== points || countCache.bundle !== bundle || countCache.proj !== proj || countCache.key !== key) {
        countCache = { points, bundle, proj, key, value: countPassing(points, sectionAt, params, proj) };
    }
    return countCache.value;
};

export function useThemeStrengthStats(params: ThemeStrengthParams): ThemeStrengthStats {
    const points = useAllPoints();
    const sections = useRankSections();
    const membersQ = useQuery(allThemeMembersQuery());

    // index 는 이 훅 인스턴스의 파생이지만 proj 는 data 참조 키의 모듈 캐시라 소비자끼리 공유된다.
    const index = useMemo(() => (membersQ.data ? buildThemeIndex(membersQ.data) : null), [membersQ.data]);

    return useMemo(() => {
        const error = points.error ?? sections.error ?? ((membersQ.error as Error | null) ?? null);
        // index === null(멤버십 data 미도착)도 로딩으로 접는다 — RQ v5 의 paused(pending 인데 fetching
        // 아님)에서 isLoading=false·data=undefined 라, 안 접으면 "통과 0/0" 으로 위장된다(useThemeIndex
        // 가 ready 를 따로 둔 것과 같은 이유).
        const isLoading = points.isLoading || sections.isLoading || membersQ.isLoading || (error === null && index === null);
        if (isLoading || error !== null || index === null || points.points.length === 0) {
            return { passed: 0, evaluable: 0, missing: 0, isLoading, error };
        }
        const proj = sharedProjOf(membersQ.data, index);
        return { ...cachedCount(points.points, sections.bundle, proj, params, sections.sectionAt), isLoading, error };
    }, [points.points, points.isLoading, points.error, sections, membersQ.data, membersQ.isLoading, membersQ.error, index, params]);
}
