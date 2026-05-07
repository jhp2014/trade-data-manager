import type { ThemeRowData } from "@/types/deck";
import type { RangeFilter } from "@/types/filter";

export function matchRank(row: ThemeRowData, range: RangeFilter): boolean {
    const val = row.selfRank;
    if (range.min !== null && val < range.min) return false;
    if (range.max !== null && val > range.max) return false;
    return true;
}
