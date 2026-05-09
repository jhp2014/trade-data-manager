"use client";

import { RangeInput } from "@/components/filter/inputs/RangeInput";
import type { ConditionKind } from "../types";
import type { StockMetricsDTO } from "@/types/deck";

export interface PullbackValue {
    min: number | null;
    max: number | null;
}

export const pullbackCondition: ConditionKind<PullbackValue> = {
    kind: "pullback",
    label: "풀백",
    defaultValue: () => ({ min: null, max: null }),
    chipFragment: ({ min, max }) => {
        if (min !== null && max !== null) return `풀백 ${min}~${max}%`;
        if (min !== null) return `풀백 ≥${min}%`;
        if (max !== null) return `풀백 ≤${max}%`;
        return "풀백";
    },
    eval: (m: StockMetricsDTO, v: PullbackValue) => {
        const pb = m.pullbackFromHigh;
        if (v.min !== null && (pb === null || pb < v.min)) return false;
        if (v.max !== null && (pb === null || pb > v.max)) return false;
        return true;
    },
    Input: ({ value, onChange }) => (
        <RangeInput
            label="풀백"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            placeholder={{ min: "예: -10", max: "예: 0" }}
            step={0.1}
        />
    ),
    serialize: ({ min, max }) => `${min ?? ""}..${max ?? ""}`,
    deserialize: (raw) => {
        const idx = raw.indexOf("..");
        if (idx === -1) return null;
        const minStr = raw.slice(0, idx);
        const maxStr = raw.slice(idx + 2);
        const min = minStr === "" ? null : parseFloat(minStr);
        const max = maxStr === "" ? null : parseFloat(maxStr);
        if (min !== null && isNaN(min)) return null;
        if (max !== null && isNaN(max)) return null;
        return { min, max };
    },
};
