import type { ThemeRowData } from "@/types/deck";
import type { RangeFilter } from "@/types/filter";

export function matchThemeSize(row: ThemeRowData, range: RangeFilter): boolean {
    if (range.min !== null && row.themeSize < range.min) return false;
    if (range.max !== null && row.themeSize > range.max) return false;
    return true;
}
