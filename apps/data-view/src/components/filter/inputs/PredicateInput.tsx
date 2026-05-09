"use client";

import { useState } from "react";
import type { MemberPredicate } from "@/lib/member/predicate";
import type { Condition } from "@/lib/condition/types";
import { CONDITION_KINDS } from "@/lib/condition";
import { ConditionInputDispatcher } from "./ConditionInputDispatcher";
import styles from "../predicate.module.css";

interface Props {
    value: MemberPredicate;
    onChange: (v: MemberPredicate) => void;
}

export function PredicateInput({ value, onChange }: Props) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [showAddMenu, setShowAddMenu] = useState(false);

    const updateCondition = (i: number, next: Condition) => {
        const conditions = [...value.conditions];
        conditions[i] = next;
        onChange({ ...value, conditions });
    };

    const removeCondition = (i: number) => {
        const conditions = value.conditions.filter((_, j) => j !== i);
        onChange({ ...value, conditions });
        if (expandedIdx === i) setExpandedIdx(null);
        else if (expandedIdx !== null && expandedIdx > i) setExpandedIdx(expandedIdx - 1);
    };

    const addCondition = (kind: string) => {
        const kindDef = CONDITION_KINDS[kind];
        if (!kindDef) return;
        const conditions = [...value.conditions, { kind, value: kindDef.defaultValue() }];
        onChange({ ...value, conditions });
        setExpandedIdx(conditions.length - 1);
        setShowAddMenu(false);
    };

    return (
        <div className={styles.predicate}>
            <div className={styles.chips}>
                {value.conditions.length === 0 && (
                    <span className={styles.emptyHint}>(조건 없음 — 모든 종목 통과)</span>
                )}
                {value.conditions.map((cond, i) => {
                    const kindDef = CONDITION_KINDS[cond.kind];
                    const label = kindDef ? kindDef.chipFragment(cond.value) : cond.kind;
                    return (
                        <span
                            key={i}
                            className={`${styles.chip} ${expandedIdx === i ? styles.chipActive : ""}`}
                        >
                            <button
                                type="button"
                                className={styles.chipLabel}
                                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                                title="클릭하여 조건 편집"
                            >
                                {label}
                            </button>
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={() => removeCondition(i)}
                                aria-label="조건 제거"
                            >
                                ×
                            </button>
                        </span>
                    );
                })}
                <div className={styles.addMenu}>
                    <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() => setShowAddMenu((v) => !v)}
                    >
                        + 조건 추가 ▾
                    </button>
                    {showAddMenu && (
                        <div className={styles.addPopover}>
                            {Object.values(CONDITION_KINDS).map((k) => (
                                <button
                                    key={k.kind}
                                    type="button"
                                    className={styles.addOption}
                                    onClick={() => addCondition(k.kind)}
                                >
                                    {k.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {expandedIdx !== null && value.conditions[expandedIdx] && (
                <div className={styles.conditionEditor}>
                    <ConditionInputDispatcher
                        condition={value.conditions[expandedIdx]}
                        onChange={(next) => updateCondition(expandedIdx, next)}
                    />
                </div>
            )}
        </div>
    );
}
