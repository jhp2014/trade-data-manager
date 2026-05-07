import type { FilterDefinition } from "./types";
import { RangeInput } from "@/components/filter/inputs/RangeInput";
import { matchMinutesSinceHigh } from "../matchers/minutesSinceHigh";

type RangeValue = { min: number | null; max: number | null };

export const minutesSinceHighFilter: FilterDefinition<RangeValue> = {
    id: "minutesSinceHigh",
    label: "고점 경과(분)",
    section: "target",
    defaultValue: { min: null, max: null },

    fromUrl: (p) => ({ min: p.mshMin, max: p.mshMax }),
    toUrl: (v) => ({ mshMin: v.min, mshMax: v.max }),

    chips: (v) => {
        const result = [];
        if (v.min !== null) result.push({ id: "mshMin", label: `고점경과 ≥ ${v.min}분` });
        if (v.max !== null) result.push({ id: "mshMax", label: `고점경과 ≤ ${v.max}분` });
        return result;
    },
    clearChip: (chipId, current) => ({
        min: chipId === "mshMin" ? null : current.min,
        max: chipId === "mshMax" ? null : current.max,
    }),

    match: (row, v) => matchMinutesSinceHigh(row, v),

    Input: ({ value, onChange }) => (
        <RangeInput
            label="고점 경과(분)"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            step={1}
        />
    ),
};
