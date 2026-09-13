// 타점 정보 줄 목록의 **값 배선** — 세 출처(축 피드·결과 단면·테마 진단)를 한 타점에 대해 모은다.
//
// 셋 다 **이미 다른 화면이 당기고 있는 파생**이라 이 패널이 여는 것만으로 새 요청이 생기면 안 된다
// (그게 생기면 배선이 틀린 것): 축 = `useRankAxes`, 결과·시뮬 = `PointGridsContext`, 테마 = 구운
// 단면 번들(`useRankSections`) + 멤버십 투영. 테마 단면을 `useDaySnapshot`(테마 순위 패널의 재계산
// 경로)으로 끌어오면 패널을 여는 것만으로 날짜당 요청이 하나씩 는다 — 그래서 번들을 쓰고, 그 분의
// 단면이 없으면 테마 줄을 아예 안 세운다(없는 값을 지어내지 않는다).
import { useMemo } from "react";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { usePlacements } from "../../lib/usePlacements.js";
import { rowLookup, type PointRef } from "../../lib/pointKey.js";
import { pointKeyOf } from "../../lib/pointKey.js";
import { useOutcomeSlices, useTradeSim } from "../../lib/PointGridsContext.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeProjection } from "../../lib/useThemeProjection.js";
import { DEFAULT_THEME_STRENGTH, themeVerdicts } from "../../lib/themeStrength.js";
import { themeParamsOf, useLinkedThemeStage } from "../filter/themeLink.js";
import { useDisplayT } from "../outcome/outcomeLink.js";
import { pointInfoRows, type PointInfoRow } from "./rows.js";

export interface PointInfoRowsView {
    /** 기본 순서(축 → 결과 → 테마)의 줄 목록. 사용자 순서는 호출부가 입힌다. */
    rows: PointInfoRow[];
    /** 지금 보는 허용 폭 T(헤더 배지) — 결과 값 전부의 기준. */
    displayT: number;
    /** 청소 기준 — 살아 있는 축 키 전부(화면에 안 선 것 포함). */
    axisKeys: readonly string[];
    /** 청소 기준 — **전체** 테마(시선 종목의 테마가 아니다). `null` = 아직 모름(청소 금지). */
    allThemes: readonly string[] | null;
    /** 재료가 아직 오는 중 — 청소가 유령을 오인하지 않게 호출부가 본다. */
    isLoading: boolean;
}

export function usePointInfoRows(point: PointRef | null): PointInfoRowsView {
    const { axes, axisIds, computedValues, computedMeta, isLoading: axesLoading } = useRankAxes();
    const placements = usePlacements();

    // ── 결과·시뮬 — 시트와 같은 출처(표시 T 단일 출처 = outcomeLink). 이 패널은 조건이 아니라 읽기 면이라
    //    제 T 를 안 든다. 조립 부품·인스턴스 갈래(시트의 scope)는 여기 없다 — 붙박이 한 벌만 본다.
    const displayT = useDisplayT();
    const sliceAt = useOutcomeSlices();
    const outcomes = sliceAt(displayT);
    const sim = useTradeSim();

    // ── 테마 — 노브는 **테마 순위 패널과 같은 연동 행**(두 화면이 다른 숫자를 말하면 안 된다).
    //    연동 행이 없으면 기본 노브로 값은 계속 보인다(존 순위 자체는 존 N·기준만 있으면 나온다).
    const { themeStages, linkedId } = useLinkedThemeStage();
    const themeParams = useMemo(() => {
        const linked = linkedId === null ? null : themeStages.find((s) => s.id === linkedId) ?? null;
        return (linked ? themeParamsOf(linked) : null) ?? DEFAULT_THEME_STRENGTH;
    }, [themeStages, linkedId]);
    const sections = useRankSections();
    const themes = useThemeProjection();

    const rows = useMemo(() => {
        if (!point) return [];
        const detail = placements.detailOf(point);
        // 시선 한 종목·한 시각에만 도는 진단이라 (그 종목의 테마 × 멤버) 한 패스다 — 모수를 도는
        // useThemeStrengthStats("호출자는 하나여야 한다")와는 층이 다르다.
        const section = themes.ready ? sections.sectionAt(point.date, point.time) : null;
        const verdicts = section ? themeVerdicts(point.stockCode, section, themeParams, themes.proj) : null;
        const key = pointKeyOf(point.stockCode, point.date, point.time);
        return pointInfoRows({
            axes,
            placed: detail.placed,
            // 시트 계산 축 셀과 같은 출처(computedValues + meta.fmt) — 두 벌이면 같은 값이 두 화면에서
            // 다른 글자로 선다. day 축 값은 차트 행이라 rowLookup 폴백이 닿는다.
            axisText: (axisKey) => {
                const v = rowLookup(computedValues.get(axisKey), point);
                const meta = computedMeta.get(axisKey);
                return v !== undefined && meta ? meta.fmt(v) : undefined;
            },
            rec: outcomes.byKey.get(key),
            sim: sim.byKey.get(key),
            verdicts,
        });
    }, [point, placements, axes, computedValues, computedMeta, outcomes, sim, sections, themes, themeParams]);

    const allThemes = useMemo(() => (themes.ready ? [...themes.proj.codesByTheme.keys()] : null), [themes]);

    return {
        rows,
        displayT,
        axisKeys: axisIds,
        allThemes,
        isLoading: axesLoading || themes.isLoading || sections.isLoading,
    };
}
