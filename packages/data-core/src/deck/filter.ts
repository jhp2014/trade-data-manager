import type { DeckEntry, DeckFilter } from "./types";

export function filterEntries(
    entries: readonly DeckEntry[],
    filter: DeckFilter
): DeckEntry[] {
    return entries.filter((e) => matchesFilter(e, filter));
}

function matchesFilter(e: DeckEntry, f: DeckFilter): boolean {
    if (f.fromDate && e.tradeDate < f.fromDate) return false;
    if (f.toDate && e.tradeDate > f.toDate) return false;
    if (f.stockCodes && !f.stockCodes.includes(e.stockCode)) return false;

    if (f.optionEquals) {
        for (const [k, v] of Object.entries(f.optionEquals)) {
            if ((e.options[k] ?? "") !== v) return false;
        }
    }

    if (f.optionIn) {
        for (const [k, candidates] of Object.entries(f.optionIn)) {
            const v = e.options[k] ?? "";
            if (!candidates.includes(v)) return false;
        }
    }

    if (f.optionIncludes) {
        for (const [k, needle] of Object.entries(f.optionIncludes)) {
            const v = e.options[k] ?? "";
            const tokens = v.split("|").map((t) => t.trim());
            if (!tokens.includes(needle)) return false;
        }
    }

    if (f.optionPrefix) {
        for (const [k, prefix] of Object.entries(f.optionPrefix)) {
            const v = e.options[k] ?? "";
            const matched =
                v === prefix || v.startsWith(prefix + "/");
            if (!matched) return false;
        }
    }

    if (f.optionPresent) {
        for (const k of f.optionPresent) {
            if (!(e.options[k] ?? "").trim()) return false;
        }
    }

    return true;
}
