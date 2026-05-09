"use client";

import type { ConditionKind } from "../types";
import type { StockMetricsDTO } from "@/types/deck";
import styles from "@/components/filter/inputs.module.css";

// 분봉 거래대금 구간 (data-core의 STAT_AMOUNTS와 동기화 유지)
const STAT_AMOUNTS = [
    20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300,
] as const;

export interface AmountHitsValue {
    threshold: number;
    minCount: number;
}

export const amountHitsCondition: ConditionKind<AmountHitsValue> = {
    kind: "amountHits",
    label: "거래대금 임계 횟수",
    defaultValue: () => ({ threshold: STAT_AMOUNTS[0], minCount: 1 }),
    chipFragment: ({ threshold, minCount }) => `${threshold}억 ${minCount}회↑`,
    eval: (m: StockMetricsDTO, v: AmountHitsValue) => {
        const count = m.amountDistribution?.[v.threshold] ?? 0;
        return count >= v.minCount;
    },
    Input: ({ value, onChange }) => (
        <div className={styles.row}>
            <label className={styles.label}>임계 대금</label>
            <select
                className={styles.input}
                value={value.threshold}
                onChange={(e) => onChange({ ...value, threshold: Number(e.target.value) })}
            >
                {STAT_AMOUNTS.map((a) => (
                    <option key={a} value={a}>
                        {a}억
                    </option>
                ))}
            </select>
            <input
                className={styles.input}
                type="number"
                step={1}
                min={1}
                placeholder="회"
                value={value.minCount}
                onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1) onChange({ ...value, minCount: n });
                }}
            />
            <span>회↑</span>
        </div>
    ),
    serialize: ({ threshold, minCount }) => `${threshold}:${minCount}`,
    deserialize: (raw) => {
        const colonIdx = raw.indexOf(":");
        if (colonIdx === -1) return null;
        const threshold = parseInt(raw.slice(0, colonIdx), 10);
        const minCount = parseInt(raw.slice(colonIdx + 1), 10);
        if (isNaN(threshold) || isNaN(minCount)) return null;
        return { threshold, minCount };
    },
};
