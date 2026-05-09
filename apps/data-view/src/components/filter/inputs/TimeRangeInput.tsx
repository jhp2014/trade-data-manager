"use client";

import styles from "../inputs.module.css";

interface Props {
    value: { from: string | null; to: string | null };
    onChange: (v: { from: string | null; to: string | null }) => void;
}

interface HM { h: string; m: string }

function parseHM(s: string | null): HM {
    if (!s) return { h: "", m: "" };
    const [h, m] = s.split(":");
    return { h: h ?? "", m: m ?? "" };
}

function composeHM(h: string, m: string): string | null {
    if (h === "" && m === "") return null;
    const hh = h === "" ? "00" : String(Math.min(23, Math.max(0, parseInt(h, 10) || 0))).padStart(2, "0");
    const mm = m === "" ? "00" : String(Math.min(59, Math.max(0, parseInt(m, 10) || 0))).padStart(2, "0");
    return `${hh}:${mm}:00`;
}

function TimePair({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string | null;
    onChange: (v: string | null) => void;
}) {
    const { h, m } = parseHM(value);
    return (
        <div className={styles.timePair} aria-label={label}>
            <input
                className={styles.input}
                type="number"
                min={0}
                max={23}
                placeholder="HH"
                value={h}
                onChange={(e) => onChange(composeHM(e.target.value, m))}
                aria-label={`${label} 시`}
            />
            <span className={styles.timeColon}>:</span>
            <input
                className={styles.input}
                type="number"
                min={0}
                max={59}
                placeholder="MM"
                value={m}
                onChange={(e) => onChange(composeHM(h, e.target.value))}
                aria-label={`${label} 분`}
            />
        </div>
    );
}

export function TimeRangeInput({ value, onChange }: Props) {
    return (
        <div className={styles.row}>
            <label className={styles.label}>시간 범위</label>
            <div className={styles.rangeInputs}>
                <TimePair label="시작" value={value.from} onChange={(v) => onChange({ ...value, from: v })} />
                <span className={styles.rangeSep}>~</span>
                <TimePair label="끝" value={value.to} onChange={(v) => onChange({ ...value, to: v })} />
            </div>
        </div>
    );
}
