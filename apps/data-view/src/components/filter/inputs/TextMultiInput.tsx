import { useState } from "react";
import styles from "../inputs.module.css";

interface Props {
    label: string;
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
}

export function TextMultiInput({ label, values, onChange, placeholder }: Props) {
    const [raw, setRaw] = useState(values.join(", "));

    const handleBlur = () => {
        const parsed = raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        onChange(parsed);
        setRaw(parsed.join(", "));
    };

    return (
        <div className={styles.row}>
            <label className={styles.label}>{label}</label>
            <input
                className={`${styles.input} ${styles.inputWide}`}
                type="text"
                placeholder={placeholder ?? "쉼표로 구분 입력"}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onBlur={handleBlur}
                aria-label={label}
            />
        </div>
    );
}
