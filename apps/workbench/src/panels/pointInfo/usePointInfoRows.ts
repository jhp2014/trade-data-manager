// 타점 정보 줄 목록의 **값 배선** — 테마 진단 한 벌(2026-09-26 종단 폐기로 축·결과 출처 은퇴).
//
// 이미 다른 화면이 당기고 있는 파생만 쓴다(이 패널이 여는 것만으로 새 요청이 생기면 배선이 틀린 것):
// 테마 = `useDaySnapshot`(react-query 캐시 — 시장 단면 판·깔때기가 이미 당기는 같은 키) + sectionSeries
// 공용 단면 캐시 + 멤버십 투영. 스냅샷이 아직 없으면 테마 줄을 안 세운다(없는 값을 지어내지 않는다).
import { useMemo } from "react";
import type { PointRef } from "../../lib/pointKey.js";
import { useThemeProjection } from "../../lib/useThemeProjection.js";
import { minuteOfDayOf, themeZoneVerdicts } from "@trade-data-manager/market/domain";
import { kstToUnix } from "../../lib/derive.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { themeSectionAt } from "../themeRank/sectionSeries.js";
import { useThemeReadParams } from "../filter/themeLink.js";
import { pointInfoRows, type PointInfoRow } from "./rows.js";

export interface PointInfoRowsView {
    rows: PointInfoRow[];
    /** 청소 기준 — **전체** 테마(시선 종목의 테마가 아니다). `null` = 아직 모름(청소 금지). */
    allThemes: readonly string[] | null;
    /** 재료가 아직 오는 중 — 청소가 유령을 오인하지 않게 호출부가 본다. */
    isLoading: boolean;
}

export function usePointInfoRows(point: PointRef | null): PointInfoRowsView {
    // 기준은 "지금 보는 존 기준"(useThemeReadParams: 첫 켜진 theme 조건 → 기본값, 2026-09-26).
    // 단면은 하루 스냅샷 즉석 계산(시장 단면 판·깔때기와 같은 sectionSeries 캐시) — 스냅샷은 시선
    // 날짜라 대개 차트·깔때기가 이미 당겨 둔 RQ 캐시를 나눠 쓴다(추가 왕복 0이 보통).
    const themeParams = useThemeReadParams();
    const snapQ = useDaySnapshot(point?.date ?? null);
    const themes = useThemeProjection();

    const rows = useMemo(() => {
        if (!point) return [];
        // 시선 한 종목·한 시각에만 도는 진단이라 (그 종목의 테마 × 멤버) 한 패스다 — 모수를 도는
        // sectionSeries 캐시("계산 주체는 core 하나")와는 층이 다르다.
        const stocks = snapQ.data?.date === point.date ? snapQ.data.stocks : null;
        const section = themes.ready && stocks !== null
            ? themeSectionAt(stocks, point.date, minuteOfDayOf(kstToUnix(point.date, point.time)), themeParams.window)
            : null;
        const verdicts = section ? themeZoneVerdicts(point.stockCode, section, themeParams, themes.proj) : null;
        return pointInfoRows({ verdicts });
    }, [point, snapQ.data, themes, themeParams]);

    const allThemes = useMemo(() => (themes.ready ? [...themes.proj.codesByTheme.keys()] : null), [themes]);

    return { rows, allThemes, isLoading: themes.isLoading || snapQ.isLoading };
}
