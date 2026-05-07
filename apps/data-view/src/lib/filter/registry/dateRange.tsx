import type { FilterDefinition } from "./types";
import { DateRangeInput } from "@/components/filter/inputs/DateRangeInput";
import { matchDateRange } from "../matchers/dateRange";

type DateRangeValue = { from: string | null; to: string | null };

export const dateRangeFilter: FilterDefinition<DateRangeValue> = {
    id: "dateRange",
    label: "날짜 범위",
    section: "target",
    defaultValue: { from: null, to: null },

    fromUrl: (p) => ({ from: p.dFrom, to: p.dTo }),
    toUrl: (v) => ({ dFrom: v.from, dTo: v.to }),

    chips: (v) => {
        const result = [];
        if (v.from !== null) result.push({ id: "dFrom", label: `날짜 ≥ ${v.from}` });
        if (v.to !== null) result.push({ id: "dTo", label: `날짜 ≤ ${v.to}` });
        return result;
    },
    clearChip: (chipId, current) => ({
        from: chipId === "dFrom" ? null : current.from,
        to: chipId === "dTo" ? null : current.to,
    }),

    match: (row, v) => matchDateRange(row, v),

    Input: DateRangeInput,
};
