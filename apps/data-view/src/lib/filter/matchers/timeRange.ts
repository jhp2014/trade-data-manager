import type { ThemeRowData } from "@/types/deck";

export function matchTimeRange(
    row: ThemeRowData,
    range: { from: string | null; to: string | null },
): boolean {
    const { tradeTime } = row.entry;
    if (range.from !== null && tradeTime < range.from) return false;
    if (range.to !== null && tradeTime > range.to) return false;
    return true;
}
