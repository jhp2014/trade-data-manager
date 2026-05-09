"use client";

import type { ConditionKind } from "../types";
import type { StockMetricsDTO } from "@/types/deck";
import styles from "@/components/filter/inputs.module.css";

export interface CumAmountValue {
    min: number;
}

export const cumAmountCondition: ConditionKind<CumAmountValue> = {
    kind: "cumAmount",
    label: "누적 거래대금",
    defaultValue: () => ({ min: 0 }),
    chipFragment: ({ min }) => `누적 ≥${min}억`,
    eval: (m: StockMetricsDTO, v: CumAmountValue) => {
        if (m.cumulativeAmount === null) return false;
        return Number(m.cumulativeAmount) / 1e8 >= v.min;
    },
    Input: ({ value, onChange }) => (
        <div className={styles.row}>
            <label className={styles.label}>누적 대금 ≥</label>
            <input
                className={styles.input}
                type="number"
                step={1}
                placeholder="억"
                value={value.min}
                onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) onChange({ min: n });
                }}
            />
            <span>억</span>
        </div>
    ),
    serialize: ({ min }) => String(min),
    deserialize: (raw) => {
        const n = parseFloat(raw);
        return isNaN(n) ? null : { min: n };
    },
};
