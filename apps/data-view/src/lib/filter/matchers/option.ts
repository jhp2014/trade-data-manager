import type { ThemeRowData } from "@/types/deck";
import type { OptionFilter } from "@/types/filter";
import { parseOptionValue } from "@/lib/options/parseOptionValue";

export function matchOption(row: ThemeRowData, filter: OptionFilter): boolean {
    const value = row.entry.options[filter.key];
    if (!value) return false;

    if (filter.mode === "anyOf") {
        if (filter.values.length === 0) return true;
        const tokens = parseOptionValue(value);
        return filter.values.some((v) => tokens.includes(v));
    }

    const needle = filter.needle.trim();
    if (!needle) return true;
    return value.toLowerCase().includes(needle.toLowerCase());
}
