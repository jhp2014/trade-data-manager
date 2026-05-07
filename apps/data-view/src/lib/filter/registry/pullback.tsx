import type { FilterDefinition } from "./types";
import { RangeInput } from "@/components/filter/inputs/RangeInput";
import { matchPullback } from "../matchers/pullback";

type RangeValue = { min: number | null; max: number | null };

export const pullbackFilter: FilterDefinition<RangeValue> = {
    id: "pullback",
    label: "풀백 (%)",
    section: "target",
    defaultValue: { min: null, max: null },

    fromUrl: (p) => ({ min: p.pbMin, max: p.pbMax }),
    toUrl: (v) => ({ pbMin: v.min, pbMax: v.max }),

    chips: (v) => {
        const result = [];
        if (v.min !== null) result.push({ id: "pbMin", label: `풀백 ≥ ${v.min}%` });
        if (v.max !== null) result.push({ id: "pbMax", label: `풀백 ≤ ${v.max}%` });
        return result;
    },
    clearChip: (chipId, current) => ({
        min: chipId === "pbMin" ? null : current.min,
        max: chipId === "pbMax" ? null : current.max,
    }),

    match: (row, v) => matchPullback(row, v),

    Input: ({ value, onChange }) => (
        <RangeInput
            label="풀백 (%)"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            placeholder={{ min: "예: -10", max: "예: 0" }}
            step={0.1}
        />
    ),
};
