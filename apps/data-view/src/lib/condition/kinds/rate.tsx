"use client";

import { RangeInput } from "@/components/filter/inputs/RangeInput";
import type { ConditionKind } from "../types";
import type { StockMetricsDTO } from "@/types/deck";

export interface RateValue {
    min: number | null;
    max: number | null;
}

export const rateCondition: ConditionKind<RateValue> = {
    kind: "rate",
    label: "등락률",
    defaultValue: () => ({ min: null, max: null }),
    chipFragment: ({ min, max }) => {
        if (min !== null && max !== null) return `등락률 ${min}~${max}%`;
        if (min !== null) return `등락률 ≥${min}%`;
        if (max !== null) return `등락률 ≤${max}%`;
        return "등락률";
    },
    eval: (m: StockMetricsDTO, v: RateValue) => {
        const rate = m.closeRate;
        if (v.min !== null && (rate === null || rate < v.min)) return false;
        if (v.max !== null && (rate === null || rate > v.max)) return false;
        return true;
    },
    Input: ({ value, onChange }) => (
        <RangeInput
            label="등락률"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            placeholder={{ min: "예: 5", max: "예: 30" }}
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
