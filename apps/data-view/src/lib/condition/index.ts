"use client";

import { rateCondition } from "./kinds/rate";
import { cumAmountCondition } from "./kinds/cumAmount";
import { amountHitsCondition } from "./kinds/amountHits";
import { pullbackCondition } from "./kinds/pullback";
import { dayHighCondition } from "./kinds/dayHigh";
import { minutesSinceHighCondition } from "./kinds/minutesSinceHigh";
import type { ConditionKind, Condition } from "./types";
import type { StockMetricsDTO } from "@/types/deck";

export const CONDITION_KINDS: Record<string, ConditionKind<any>> = { // any: 다형 레지스트리
    rate: rateCondition,
    cumAmount: cumAmountCondition,
    amountHits: amountHitsCondition,
    pullback: pullbackCondition,
    dayHigh: dayHighCondition,
    minutesSinceHigh: minutesSinceHighCondition,
};

export function evalCondition(m: StockMetricsDTO, c: Condition): boolean {
    const kind = CONDITION_KINDS[c.kind];
    if (!kind) return true;
    return kind.eval(m, c.value);
}

export function serializeCondition(c: Condition): string {
    const kind = CONDITION_KINDS[c.kind];
    if (!kind) return `${c.kind}:`;
    return `${c.kind}:${kind.serialize(c.value)}`;
}

export function deserializeCondition(raw: string): Condition | null {
    const idx = raw.indexOf(":");
    if (idx === -1) return null;
    const kindKey = raw.slice(0, idx);
    const rawValue = raw.slice(idx + 1);
    const kind = CONDITION_KINDS[kindKey];
    if (!kind) return null;
    const value = kind.deserialize(rawValue);
    if (value === null) return null;
    return { kind: kindKey, value };
}

export type { ConditionKind, Condition } from "./types";
