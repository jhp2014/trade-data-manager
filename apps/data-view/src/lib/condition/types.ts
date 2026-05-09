import type { ComponentType } from "react";
import type { StockMetricsDTO } from "@/types/deck";

export interface ConditionKind<TValue> {
    kind: string;
    label: string;
    defaultValue: () => TValue;
    chipFragment: (v: TValue) => string;
    eval: (m: StockMetricsDTO, v: TValue) => boolean;
    Input: ComponentType<{ value: TValue; onChange: (v: TValue) => void }>;
    serialize: (v: TValue) => string;
    deserialize: (raw: string) => TValue | null;
}

export interface Condition {
    kind: string;
    value: unknown;
}
