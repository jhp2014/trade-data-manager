import type { ThemeRowData } from "@/types/deck";
import type { FilterState } from "@/types/filter";
import {
    matchThemeSize,
    matchThemeMemberSlot,
    matchStockCode,
    matchDateRange,
    matchTimeRange,
    matchCloseRate,
    matchRank,
    matchPullback,
    matchMinutesSinceHigh,
    matchOption,
} from "./matchers";

export function applyFilters(rows: ThemeRowData[], filter: FilterState): ThemeRowData[] {
    return rows.filter((row) => {
        if (!matchThemeSize(row, filter.themeSizeRange)) return false;
        if (!matchThemeMemberSlot(row, filter.themeMemberSlot)) return false;
        if (!matchStockCode(row, filter.stockCodes)) return false;
        if (!matchDateRange(row, filter.dateRange)) return false;
        if (!matchTimeRange(row, filter.timeRange)) return false;
        if (!matchCloseRate(row, filter.closeRateRange)) return false;
        if (!matchRank(row, filter.rankRange)) return false;
        if (!matchPullback(row, filter.pullbackRange)) return false;
        if (!matchMinutesSinceHigh(row, filter.minutesSinceHighRange)) return false;
        for (const opt of filter.optionFilters) {
            if (!matchOption(row, opt)) return false;
        }
        return true;
    });
}
