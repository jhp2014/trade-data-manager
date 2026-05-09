"use client";

import { PredicateInput } from "@/components/filter/inputs/PredicateInput";
import {
    chipLabelForPredicate,
    serializePredicate,
    deserializePredicate,
} from "@/lib/member/predicate";
import type { MemberPredicate } from "@/lib/member/predicate";
import type { FilterKind } from "./types";
import styles from "@/components/filter/inputs.module.css";

export interface ActiveMembersValue {
    predicate: MemberPredicate;
    countMin: number;
}

export const activeMembersInThemeKind: FilterKind<ActiveMembersValue> = {
    kind: "activeMembersInTheme",
    label: "Active 멤버 슬롯",
    section: "theme",
    multiple: true,
    defaultValue: () => ({ predicate: { conditions: [] }, countMin: 1 }),
    chipLabel: (v) => {
        const label = chipLabelForPredicate(v.predicate);
        return `Active [${label}] ≥${v.countMin}개`;
    },
    match: (_row, v, derived, instanceId) => {
        const pool = derived.activePools.find((p) => p.instanceId === instanceId);
        if (!pool) return false;
        return pool.poolSize >= v.countMin;
    },
    Input: ({ value, onChange }) => (
        <div>
            <PredicateInput
                value={value.predicate}
                onChange={(p) => onChange({ ...value, predicate: p })}
            />
            <div className={styles.row}>
                <label className={styles.label}>만족 종목 ≥</label>
                <input
                    className={styles.input}
                    type="number"
                    step={1}
                    min={1}
                    placeholder="개"
                    value={value.countMin}
                    onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (!isNaN(n) && n >= 1) onChange({ ...value, countMin: n });
                    }}
                />
                <span>개</span>
            </div>
        </div>
    ),
    // 직렬화: "<predicate_serialized>|<countMin>"
    serialize: (v) => `${serializePredicate(v.predicate)}|${v.countMin}`,
    deserialize: (raw) => {
        const pipeIdx = raw.lastIndexOf("|");
        if (pipeIdx === -1) return null;
        const predicateStr = raw.slice(0, pipeIdx);
        const countMin = parseInt(raw.slice(pipeIdx + 1), 10);
        if (isNaN(countMin)) return null;
        return { predicate: deserializePredicate(predicateStr), countMin };
    },
};
