"use client";

import styles from "../FilterPanel.module.css";

interface Props {
    value: { from: string | null; to: string | null };
    onChange: (v: { from: string | null; to: string | null }) => void;
}

export function DateRangeInput({ value, onChange }: Props) {
    return (
        <div className={styles.dateRow}>
            <label className={styles.label}>날짜 범위</label>
            <div className={styles.dateInputs}>
                <input
                    className={styles.dateInput}
                    type="date"
                    value={value.from ?? ""}
                    onChange={(e) => onChange({ ...value, from: e.target.value || null })}
                    aria-label="시작 날짜"
                />
                <span className={styles.dateSep}>~</span>
                <input
                    className={styles.dateInput}
                    type="date"
                    value={value.to ?? ""}
                    onChange={(e) => onChange({ ...value, to: e.target.value || null })}
                    aria-label="종료 날짜"
                />
            </div>
        </div>
    );
}
