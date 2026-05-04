import styles from "./OptionChips.module.css";

interface Props {
  options: Record<string, string>;
}

export function OptionChips({ options }: Props) {
  const entries = Object.entries(options).filter(([, v]) => v.trim() !== "");
  if (entries.length === 0) return null;
  return (
    <div className={styles.chips}>
      {entries.map(([k, v]) => (
        <span key={k} className={styles.chip}>
          <span className={styles.key}>{k}</span>
          {v}
        </span>
      ))}
    </div>
  );
}
