import type { ThemeRowData } from "@/types/deck";
import type { RangeFilter } from "@/types/filter";

export function matchPullback(row: ThemeRowData, range: RangeFilter): boolean {
    const val = row.self.pullbackFromHigh;
    if (range.min !== null) {
        if (val === null || val < range.min) return false;
    }
    if (range.max !== null) {
        if (val === null || val > range.max) return false;
    }
    return true;
}
