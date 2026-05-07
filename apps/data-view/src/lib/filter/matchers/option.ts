import type { ThemeRowData } from "@/types/deck";
import type { OptionFilter } from "@/types/filter";

export function matchOption(row: ThemeRowData, filter: OptionFilter): boolean {
    const value = row.entry.options[filter.key];
    if (value === undefined || value === "") return false;
    const tokens = value.split("|").map((t) => t.trim());
    return tokens.includes(filter.needle);
}
