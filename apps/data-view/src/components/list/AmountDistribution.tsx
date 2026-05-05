import styles from "./AmountDistribution.module.css";

interface Props {
    distribution: Record<number, number>;
}

export function AmountDistribution({ distribution }: Props) {
    const entries = Object.entries(distribution)
        .map(([k, v]) => [Number(k), v] as [number, number])
        .sort((a, b) => a[0] - b[0]);

    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total === 0) {
        return (
            <div className={styles.box}>
                <span className={styles.empty}>해당 시점까지 분포 없음</span>
            </div>
        );
    }

    return (
        <div className={styles.box}>
            {entries.map(([amt, cnt]) => (
                <div
                    key={amt}
                    className={`${styles.bucket} ${cnt === 0 ? styles.zero : ""}`}
                >
                    <span className={styles.amt}>{amt}억</span>
                    <span className={styles.cnt}>{cnt}</span>
                </div>
            ))}
        </div>
    );
}
