import { parseOptionValue } from "@/lib/options/parseOptionValue";
import styles from "./EntryRow.module.css";

interface Props {
    options: Record<string, string>;
    visibleKeys: string[];
}

export function OptionsCell({ options, visibleKeys }: Props) {
    if (visibleKeys.length === 0) {
        return <div className={styles.optionsCell} />;
    }

    return (
        <div className={styles.optionsCell}>
            {visibleKeys.map((k) => {
                const raw = options[k];
                const tokens = raw ? parseOptionValue(raw) : [];
                return (
                    <span key={k} className={styles.optionPair}>
                        <span className={styles.optionPairKey}>{k}:</span>
                        {tokens.length > 0 ? (
                            <span className={styles.optionPairValue}>
                                {tokens.map((t, i) => (
                                    <span key={i} className={styles.optionToken}>{t}</span>
                                ))}
                            </span>
                        ) : (
                            <span className={styles.optionPairValueEmpty}>-</span>
                        )}
                    </span>
                );
            })}
        </div>
    );
}
