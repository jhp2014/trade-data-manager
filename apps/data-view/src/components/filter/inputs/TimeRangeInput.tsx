"use client";

import styles from "../FilterPanel.module.css";

interface Props {
    value: { from: string | null; to: string | null };
    onChange: (v: { from: string | null; to: string | null }) => void;
}

export function TimeRangeInput({ value, onChange }: Props) {
    return (
        <div className={styles.dateRow}>
            <label className={styles.label}>시간 범위</label>
            <div className={styles.dateInputs}>
                <input
                    className={styles.dateInput}
                    type="time"
                    step="60"
                    value={value.from ? value.from.slice(0, 5) : ""}
                    onChange={(e) =>
                        onChange({ ...value, from: e.target.value ? `${e.target.value}:00` : null })
                    }
                    aria-label="시작 시간"
                />
                <span className={styles.dateSep}>~</span>
                <input
                    className={styles.dateInput}
                    type="time"
                    step="60"
                    value={value.to ? value.to.slice(0, 5) : ""}
                    onChange={(e) =>
                        onChange({ ...value, to: e.target.value ? `${e.target.value}:00` : null })
                    }
                    aria-label="종료 시간"
                />
            </div>
        </div>
    );
}
