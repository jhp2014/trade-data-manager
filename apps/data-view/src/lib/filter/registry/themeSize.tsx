import type { FilterDefinition } from "./types";
import { RangeInput } from "@/components/filter/inputs/RangeInput";
import { matchThemeSize } from "../matchers/themeSize";

type ThemeSizeValue = { min: number | null; max: number | null };

export const themeSizeFilter: FilterDefinition<ThemeSizeValue> = {
    id: "themeSize",
    label: "테마 종목 수",
    section: "theme",
    defaultValue: { min: null, max: null },

    fromUrl: (p) => ({ min: p.tsMin, max: p.tsMax }),
    toUrl: (v) => ({ tsMin: v.min, tsMax: v.max }),

    chips: (v) => {
        const result = [];
        if (v.min !== null) result.push({ id: "tsMin", label: `테마종목 ≥ ${v.min}` });
        if (v.max !== null) result.push({ id: "tsMax", label: `테마종목 ≤ ${v.max}` });
        return result;
    },
    clearChip: (chipId, current) => ({
        min: chipId === "tsMin" ? null : current.min,
        max: chipId === "tsMax" ? null : current.max,
    }),

    match: (row, v) => matchThemeSize(row, v),

    Input: ({ value, onChange }) => (
        <RangeInput
            label="종목 수"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            step={1}
        />
    ),
};
