import type { ThemeRowData } from "@/types/deck";

export function matchStockCode(row: ThemeRowData, codes: string[]): boolean {
    if (codes.length === 0) return true;
    return codes.includes(row.entry.stockCode);
}
