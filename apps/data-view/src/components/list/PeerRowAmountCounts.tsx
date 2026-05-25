import { PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK } from "@/lib/constants";
import styles from "./PeerRowAmountCounts.module.css";

/**
 * PeerListModal row 에 표시하는 거래대금 누적 카운트 inline 표시.
 *
 *  - 활성: amountDistribution != null & 최소 임계값 카운트 > 0 → 파랑 dot + 모든 카운트
 *  - 비활성: amountDistribution != null & 최소 임계값 카운트 == 0 → 빨강 dot 만
 *  - 미존재: amountDistribution == null → null 반환 (영역 자체 미렌더)
 */
export function PeerRowAmountCounts({
    distribution,
}: {
    distribution: Record<number, number> | null;
}) {
    if (distribution == null) return null;

    const thresholds = PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK;
    const minThreshold = thresholds[0];
    const minCount = distribution[minThreshold] ?? 0;
    const isActive = minCount > 0;

    return (
        <div className={styles.container}>
            <span
                className={`${styles.dot} ${isActive ? styles.dotActive : styles.dotInactive}`}
            />
            {isActive && (
                <div className={styles.counts}>
                    {thresholds.map((t) => (
                        <span key={t} className={styles.item}>
                            <span className={styles.threshold}>{t}억</span>
                            <span className={styles.value}>
                                {distribution[t] ?? 0}
                            </span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
