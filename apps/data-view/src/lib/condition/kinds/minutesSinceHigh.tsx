"use client";

import { RangeInput } from "@/components/filter/inputs/RangeInput";
import type { ConditionKind } from "../types";
import type { StockMetricsDTO } from "@/types/deck";

export interface MinutesSinceHighValue {
    min: number | null;
    max: number | null;
}

export const minutesSinceHighCondition: ConditionKind<MinutesSinceHighValue> = {
    kind: "minutesSinceHigh",
    label: "고점 경과 분",
    defaultValue: () => ({ min: null, max: null }),
    chipFragment: ({ min, max }) => {
        if (min !== null && max !== null) return `고점경과 ${min}~${max}분`;
        if (min !== null) return `고점경과 ≥${min}분`;
        if (max !== null) return `고점경과 ≤${max}분`;
        return "고점경과";
    },
    eval: (m: StockMetricsDTO, v: MinutesSinceHighValue) => {
        const mins = m.minutesSinceDayHigh;
        if (v.min !== null && (mins === null || mins < v.min)) return false;
        if (v.max !== null && (mins === null || mins > v.max)) return false;
        return true;
    },
    Input: ({ value, onChange }) => (
        <RangeInput
            label="고점경과"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            placeholder={{ min: "분", max: "분" }}
            step={1}
        />
    ),
    serialize: ({ min, max }) => `${min ?? ""}..${max ?? ""}`,
    deserialize: (raw) => {
        const idx = raw.indexOf("..");
        if (idx === -1) return null;
        const minStr = raw.slice(0, idx);
        const maxStr = raw.slice(idx + 2);
        const min = minStr === "" ? null : parseInt(minStr, 10);
        const max = maxStr === "" ? null : parseInt(maxStr, 10);
        if (min !== null && isNaN(min)) return null;
        if (max !== null && isNaN(max)) return null;
        return { min, max };
    },
};
