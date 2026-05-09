"use client";

import type { ComponentType } from "react";
import type { Condition } from "@/lib/condition/types";
import { CONDITION_KINDS } from "@/lib/condition";

interface Props {
    condition: Condition;
    onChange: (c: Condition) => void;
}

export function ConditionInputDispatcher({ condition, onChange }: Props) {
    const kindDef = CONDITION_KINDS[condition.kind];
    if (!kindDef) return <span>알 수 없는 조건: {condition.kind}</span>;
    const Input = kindDef.Input as ComponentType<{ value: any; onChange: (v: any) => void }>; // any: ConditionKind<unknown> 브릿지
    return (
        <Input
            value={condition.value}
            onChange={(v) => onChange({ kind: condition.kind, value: v })}
        />
    );
}
