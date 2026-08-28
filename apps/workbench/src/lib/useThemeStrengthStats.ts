// 테마 강도 통계 — 라이브 카운트(3항) + 컷 레일 틱을 한 훅으로. (구 panels/themeRank/useThemeRankCount)
//
// lib 에 사는 이유: 소비자가 둘이다 — 집합 편성 보드(연동 행 배지·레일 틱)와 테마 순위 패널(헤더
// 카운트). 보드가 panels/themeRank 를 물면 패널 간 의존이 생긴다.
//
// **모듈 레벨 1-엔트리 메모**: 컴포넌트별 useMemo 만으론 두 소비자가 같은 params 로 같은 무거운
// 패스(모수 ~수천 × 테마 × 멤버)를 각자 돈다. 두 소비자는 항상 같은 연동 행 params 를 보므로
// 1-엔트리로 충분하고, 갈리면 그냥 재계산될 뿐이라 정확성엔 무해하다. 캐시 키는 전부 **공유 참조**
// (RQ 캐시의 points/bundle/멤버십 data)여야 한다 — 컴포넌트별로 새로 서는 파생(sectionAt 클로저,
// useThemeIndex 의 index)을 키에 넣으면 컴포넌트 수만큼 미스가 난다. 그래서 멤버십도 여기서 쿼리를
// 직접 접어 proj 를 모듈 캐시로 공유한다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildThemeIndex } from "@trade-data-manager/market/domain";
import { allThemeMembersQuery } from "../api/queries.js";
import { useAllPoints } from "./useAllPoints.js";
import { useRankSections } from "./useRankSections.js";
import {
    bestZoneRanksOf, countPassing, selfOrdinalsOf, themeProjectionOf,
    type SectionRanks, type StrengthCount, type ThemeProjection, type ThemeStrengthParams,
} from "./themeStrength.js";

/** 컷 레일 틱 재료 — 서수 도메인 상한과 모수 분포(근사·참고용 — themeStrength 머리 주석). */
export interface StrengthTicks {
    /** 번들 전체의 유니버스 최대(하루별 codes 최대) — 서수 레일의 도메인 상한. 번들 없으면 0. */
    universeMax: number;
    rateOrds: readonly number[];
    amountOrds: readonly number[];
    zoneRanks: readonly number[];
}

export interface ThemeStrengthStats extends StrengthCount {
    /** 재료가 아직 안 왔다 — 숫자를 0 으로 오독하지 않게 겉으로 낸다. */
    isLoading: boolean;
    /** 재료 로드 실패 — "통과 0" 으로 위장되지 않게 겉으로 낸다. */
    error: Error | null;
    ticks: StrengthTicks;
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

let ordsCache: { points: unknown; bundle: unknown; value: { rateOrds: number[]; amountOrds: number[] } } | null = null;
const cachedOrds = (points: Points, bundle: unknown, sectionAt: SectionAt): { rateOrds: number[]; amountOrds: number[] } => {
    if (!ordsCache || ordsCache.points !== points || ordsCache.bundle !== bundle) {
        ordsCache = { points, bundle, value: selfOrdinalsOf(points, sectionAt) };
    }
    return ordsCache.value;
};

let zoneCache: { points: unknown; bundle: unknown; proj: unknown; key: string; value: number[] } | null = null;
const cachedZoneRanks = (points: Points, bundle: unknown, proj: ThemeProjection, params: ThemeStrengthParams, sectionAt: SectionAt): number[] => {
    const key = `${params.zoneRateN}|${params.zoneAmountN}|${params.basis}`; // 임계값 드래그는 이 캐시를 안 흔든다
    if (!zoneCache || zoneCache.points !== points || zoneCache.bundle !== bundle || zoneCache.proj !== proj || zoneCache.key !== key) {
        zoneCache = { points, bundle, proj, key, value: bestZoneRanksOf(points, sectionAt, params, proj) };
    }
    return zoneCache.value;
};

const EMPTY_ORDS: number[] = [];

export function useThemeStrengthStats(params: ThemeStrengthParams): ThemeStrengthStats {
    const points = useAllPoints();
    const sections = useRankSections();
    const membersQ = useQuery(allThemeMembersQuery());

    // index 는 이 훅 인스턴스의 파생이지만 proj 는 data 참조 키의 모듈 캐시라 소비자끼리 공유된다.
    const index = useMemo(() => (membersQ.data ? buildThemeIndex(membersQ.data) : null), [membersQ.data]);

    return useMemo(() => {
        const isLoading = points.isLoading || sections.isLoading || membersQ.isLoading;
        const error = points.error ?? sections.error ?? ((membersQ.error as Error | null) ?? null);
        const universeMax = sections.bundle?.dates.reduce((m, d) => Math.max(m, d.codes.length), 0) ?? 0;
        const empty: StrengthTicks = { universeMax, rateOrds: EMPTY_ORDS, amountOrds: EMPTY_ORDS, zoneRanks: EMPTY_ORDS };
        if (isLoading || error !== null || index === null || points.points.length === 0) {
            return { passed: 0, evaluable: 0, missing: 0, isLoading, error, ticks: empty };
        }
        const proj = sharedProjOf(membersQ.data, index);
        const ords = cachedOrds(points.points, sections.bundle, sections.sectionAt);
        return {
            ...cachedCount(points.points, sections.bundle, proj, params, sections.sectionAt),
            isLoading,
            error,
            ticks: {
                universeMax,
                rateOrds: ords.rateOrds,
                amountOrds: ords.amountOrds,
                zoneRanks: cachedZoneRanks(points.points, sections.bundle, proj, params, sections.sectionAt),
            },
        };
    }, [points.points, points.isLoading, points.error, sections, membersQ.data, membersQ.isLoading, membersQ.error, index, params]);
}
