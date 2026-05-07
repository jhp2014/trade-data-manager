import styles from "../inputs.module.css";

interface Props {
    label: string;
    minValue: number | null;
    maxValue: number | null;
    onMinChange: (v: number | null) => void;
    onMaxChange: (v: number | null) => void;
    placeholder?: { min?: string; max?: string };
    step?: number;
}

export function RangeInput({
    label,
    minValue,
    maxValue,
    onMinChange,
    onMaxChange,
    placeholder,
    step,
}: Props) {
    const parse = (raw: string): number | null => {
        const n = parseFloat(raw);
        return isNaN(n) ? null : n;
    };

    return (
        <div className={styles.row}>
            <label className={styles.label}>{label}</label>
            <div className={styles.rangeInputs}>
                <input
                    className={styles.input}
                    type="number"
                    step={step}
                    placeholder={placeholder?.min ?? "최솟값"}
                    value={minValue ?? ""}
                    onChange={(e) => onMinChange(parse(e.target.value))}
                    aria-label={`${label} 최솟값`}
                />
                <span className={styles.rangeSep}>~</span>
                <input
                    className={styles.input}
                    type="number"
                    step={step}
                    placeholder={placeholder?.max ?? "최댓값"}
                    value={maxValue ?? ""}
                    onChange={(e) => onMaxChange(parse(e.target.value))}
                    aria-label={`${label} 최댓값`}
                />
            </div>
        </div>
    );
}
