import type { ThemeRowData } from "@/types/deck";

export function sortRows(rows: ThemeRowData[]): ThemeRowData[] {
    return [...rows].sort((a, b) => {
        const dateCompare = b.entry.tradeDate.localeCompare(a.entry.tradeDate);
        if (dateCompare !== 0) return dateCompare;

        const themeCompare = a.themeName.localeCompare(b.themeName, "ko");
        if (themeCompare !== 0) return themeCompare;

        const nameCompare = a.self.stockName.localeCompare(b.self.stockName, "ko");
        if (nameCompare !== 0) return nameCompare;

        return a.entry.tradeTime.localeCompare(b.entry.tradeTime);
    });
}
