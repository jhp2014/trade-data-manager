import {
    formatPercent,
    formatKrwShort,
    riseFallClass,
} from "@/components/format/number";
import styles from "../EntryRow.module.css";

export function MetricChangeRate({ value }: { value: number | null }) {
    return (
        <div className={styles.metric}>
            <span className={`tabular ${riseFallClass(value)} ${styles.metricMain}`}>
                {formatPercent(value)}
            </span>
        </div>
    );
}

export function MetricDayHigh({
    dayHighRate,
    pullback,
    minutesSince,
}: {
    dayHighRate: number | null;
    pullback: number | null;
    minutesSince: number | null;
}) {
    return (
        <div className={styles.metric}>
            <span className={`tabular ${riseFallClass(dayHighRate)} ${styles.metricMain}`}>
                {formatPercent(dayHighRate)}
            </span>
            <span className={styles.metricSub}>
                <span className={`tabular ${riseFallClass(pullback)}`}>
                    {formatPercent(pullback)}
                </span>
                <span className={styles.dot}>·</span>
                <span className="tabular">
                    {minutesSince === null ? "-" : `${minutesSince}분`}
                </span>
            </span>
        </div>
    );
}

export function MetricAmount({
    cumulative,
    tradeTime,
}: {
    cumulative: string | null;
    tradeTime: string;
}) {
    return (
        <div className={styles.metric}>
            <span className={`tabular ${styles.metricMain}`}>
                {formatKrwShort(cumulative)}
            </span>
            <span className={styles.metricSub}>
                <span className="tabular">{tradeTime.slice(0, 5)}</span>
            </span>
        </div>
    );
}
