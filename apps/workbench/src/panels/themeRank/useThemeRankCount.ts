// 라이브 통과 카운트 — 현재(미리보기 포함) 묶음 파라미터를 **1년치 타점 모수 전체**에 적용한 3항.
// 재료: 타점 전량(useAllPoints) × 구운 번들 단면(useRankSections) × 테마 인덱스(읽기 시점).
// 평가 순수함수는 lib/themeStrength — 다음 단계의 깔때기 필터가 같은 함수를 쓴다(여기서 갈리면 안 된다).
import { useMemo } from "react";
import { useAllPoints } from "../../lib/useAllPoints.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { countPassing, themeProjectionOf, type StrengthCount, type ThemeStrengthParams } from "../../lib/themeStrength.js";

export interface ThemeRankCount extends StrengthCount {
    /** 재료가 아직 안 왔다 — 숫자를 0 으로 오독하지 않게 겉으로 낸다. */
    isLoading: boolean;
    /** 재료 로드 실패 — "통과 0" 으로 위장되지 않게 겉으로 낸다(세 훅이 error 를 내는 이유와 같다). */
    error: Error | null;
}

export function useThemeRankCount(params: ThemeStrengthParams): ThemeRankCount {
    const points = useAllPoints();
    const sections = useRankSections();
    const themes = useThemeIndex();

    const proj = useMemo(() => themeProjectionOf(themes.index), [themes.index]);
    return useMemo(() => {
        const isLoading = points.isLoading || sections.isLoading || themes.isLoading;
        const error = points.error ?? sections.error ?? themes.error;
        if (isLoading || error !== null || points.points.length === 0) return { passed: 0, evaluable: 0, missing: 0, isLoading, error };
        return { ...countPassing(points.points, sections.sectionAt, params, proj), isLoading, error };
    }, [points.points, points.isLoading, points.error, sections, themes.isLoading, themes.error, params, proj]);
}
