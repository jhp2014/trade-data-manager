import type { DeckEntryDTO } from "@/types/deck";
import { parseOptionValue } from "./parseOptionValue";

export interface OptionMeta {
    key: string;
    values: string[];
    defaultMode: "anyOf" | "contains";
    isMultiToken: boolean;
}

const ANY_OF_MAX_DISTINCT = 20;

export function buildOptionRegistry(
    entries: DeckEntryDTO[],
    optionKeys: string[],
): Map<string, OptionMeta> {
    const map = new Map<string, OptionMeta>();

    for (const key of optionKeys) {
        const distinct = new Set<string>();
        let isMultiToken = false;

        for (const entry of entries) {
            const raw = entry.options[key];
            if (!raw) continue;
            if (!isMultiToken && raw.includes("|")) isMultiToken = true;
            for (const token of parseOptionValue(raw)) {
                distinct.add(token);
            }
        }

        const values = Array.from(distinct).sort((a, b) =>
            a.localeCompare(b, "ko"),
        );

        map.set(key, {
            key,
            values,
            defaultMode: values.length <= ANY_OF_MAX_DISTINCT ? "anyOf" : "contains",
            isMultiToken,
        });
    }

    return map;
}
