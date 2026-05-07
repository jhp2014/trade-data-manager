import type { FilterDefinition } from "./types";
import { RangeInput } from "@/components/filter/inputs/RangeInput";
import { matchRank } from "../matchers/rank";

type RangeValue = { min: number | null; max: number | null };

export const rankFilter: FilterDefinition<RangeValue> = {
    id: "rank",
    label: "등수",
    section: "target",
    defaultValue: { min: null, max: null },

    fromUrl: (p) => ({ min: p.rankMin, max: p.rankMax }),
    toUrl: (v) => ({ rankMin: v.min, rankMax: v.max }),

    chips: (v) => {
        const result = [];
        if (v.min !== null) result.push({ id: "rankMin", label: `등수 ≥ ${v.min}` });
        if (v.max !== null) result.push({ id: "rankMax", label: `등수 ≤ ${v.max}` });
        return result;
    },
    clearChip: (chipId, current) => ({
        min: chipId === "rankMin" ? null : current.min,
        max: chipId === "rankMax" ? null : current.max,
    }),

    match: (row, v) => matchRank(row, v),

    Input: ({ value, onChange }) => (
        <RangeInput
            label="등수"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            step={1}
        />
    ),
};
