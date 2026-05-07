import styles from "../inputs.module.css";

interface Props {
    optionKey: string;
    needle: string;
    onChange: (needle: string) => void;
}

export function OptionRow({ optionKey, needle, onChange }: Props) {
    return (
        <div className={styles.row}>
            <label className={styles.label}>{optionKey}</label>
            <input
                className={`${styles.input} ${styles.inputWide}`}
                type="text"
                placeholder="포함 값 입력"
                value={needle}
                onChange={(e) => onChange(e.target.value)}
                aria-label={`옵션 ${optionKey} 필터`}
            />
        </div>
    );
}
