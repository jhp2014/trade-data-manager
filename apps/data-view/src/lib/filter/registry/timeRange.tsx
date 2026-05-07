import type { FilterDefinition } from "./types";
import { TimeRangeInput } from "@/components/filter/inputs/TimeRangeInput";
import { matchTimeRange } from "../matchers/timeRange";

type TimeRangeValue = { from: string | null; to: string | null };

export const timeRangeFilter: FilterDefinition<TimeRangeValue> = {
    id: "timeRange",
    label: "시간 범위",
    section: "target",
    defaultValue: { from: null, to: null },

    fromUrl: (p) => ({ from: p.tFrom, to: p.tTo }),
    toUrl: (v) => ({ tFrom: v.from, tTo: v.to }),

    chips: (v) => {
        const result = [];
        if (v.from !== null) result.push({ id: "tFrom", label: `시간 ≥ ${v.from}` });
        if (v.to !== null) result.push({ id: "tTo", label: `시간 ≤ ${v.to}` });
        return result;
    },
    clearChip: (chipId, current) => ({
        from: chipId === "tFrom" ? null : current.from,
        to: chipId === "tTo" ? null : current.to,
    }),

    match: (row, v) => matchTimeRange(row, v),

    Input: TimeRangeInput,
};
