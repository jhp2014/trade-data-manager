/**
 * 등록된 필터 정의 배열. 배열 순서 = FilterPanel 표시 순서.
 * See: docs/architecture/filter-system.md, docs/adding-filter.md
 */
import { themeSizeFilter } from "./themeSize";
import { themeMemberSlotFilter } from "./themeMemberSlot";
import { stockCodeFilter } from "./stockCode";
import { dateRangeFilter } from "./dateRange";
import { timeRangeFilter } from "./timeRange";
import { closeRateFilter } from "./closeRate";
import { rankFilter } from "./rank";
import { pullbackFilter } from "./pullback";
import { minutesSinceHighFilter } from "./minutesSinceHigh";
import type { AnyFilterDef } from "./types";

export const FILTERS: AnyFilterDef[] = [
    // ── 테마 단위 ──────────────────────────────────────────
    themeSizeFilter,
    themeMemberSlotFilter,
    // ── Target 종목 단위 ───────────────────────────────────
    stockCodeFilter,
    dateRangeFilter,
    timeRangeFilter,
    closeRateFilter,
    rankFilter,
    pullbackFilter,
    minutesSinceHighFilter,
];

export type { FilterDefinition, AnyFilterDef, FilterChip } from "./types";
export type { FilterUrlParams } from "./urlParams";
