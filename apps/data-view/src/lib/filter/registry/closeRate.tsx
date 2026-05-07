import type { FilterDefinition } from "./types";
import { RangeInput } from "@/components/filter/inputs/RangeInput";
import { matchCloseRate } from "../matchers/closeRate";

type RangeValue = { min: number | null; max: number | null };

export const closeRateFilter: FilterDefinition<RangeValue> = {
    id: "closeRate",
    label: "등락률 (%)",
    section: "target",
    defaultValue: { min: null, max: null },

    fromUrl: (p) => ({ min: p.rateMin, max: p.rateMax }),
    toUrl: (v) => ({ rateMin: v.min, rateMax: v.max }),

    chips: (v) => {
        const result = [];
        if (v.min !== null) result.push({ id: "rateMin", label: `등락률 ≥ ${v.min}%` });
        if (v.max !== null) result.push({ id: "rateMax", label: `등락률 ≤ ${v.max}%` });
        return result;
    },
    clearChip: (chipId, current) => ({
        min: chipId === "rateMin" ? null : current.min,
        max: chipId === "rateMax" ? null : current.max,
    }),

    match: (row, v) => matchCloseRate(row, v),

    Input: ({ value, onChange }) => (
        <RangeInput
            label="등락률 (%)"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            placeholder={{ min: "예: 5", max: "예: 30" }}
            step={0.1}
        />
    ),
};
