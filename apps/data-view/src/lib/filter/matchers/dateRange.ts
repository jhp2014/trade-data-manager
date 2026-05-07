import type { ThemeRowData } from "@/types/deck";

export function matchDateRange(
    row: ThemeRowData,
    range: { from: string | null; to: string | null },
): boolean {
    const { tradeDate } = row.entry;
    if (range.from !== null && tradeDate < range.from) return false;
    if (range.to !== null && tradeDate > range.to) return false;
    return true;
}
