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

const DAY_CANDLE_MIN_PCT = -5;
const DAY_CANDLE_MAX_PCT = 30;
const DAY_CANDLE_WIDTH = 80;
const DAY_CANDLE_HEIGHT = 16;
const DAY_CANDLE_PAD_X = 4;

function pctToX(pct: number): number {
    const clamped = Math.max(DAY_CANDLE_MIN_PCT, Math.min(DAY_CANDLE_MAX_PCT, pct));
    const ratio = (clamped - DAY_CANDLE_MIN_PCT) / (DAY_CANDLE_MAX_PCT - DAY_CANDLE_MIN_PCT);
    return DAY_CANDLE_PAD_X + ratio * (DAY_CANDLE_WIDTH - DAY_CANDLE_PAD_X * 2);
}

export function MetricDayCandle({
    closeRate,
    dayHighRate,
}: {
    closeRate: number | null;
    dayHighRate: number | null;
}) {
    const cy = DAY_CANDLE_HEIGHT / 2;
    const zeroX = pctToX(0);

    const showHighBar = dayHighRate !== null && dayHighRate > 0;
    const highX = showHighBar ? pctToX(dayHighRate as number) : zeroX;

    const showClose = closeRate !== null;
    const closeX = showClose ? pctToX(closeRate as number) : null;
    const closeColor =
        closeRate === null
            ? "transparent"
            : closeRate > 0
                ? "#ef4444"
                : closeRate < 0
                    ? "#3b82f6"
                    : "#8b95a1";

    return (
        <svg
            width={DAY_CANDLE_WIDTH}
            height={DAY_CANDLE_HEIGHT}
            viewBox={`0 0 ${DAY_CANDLE_WIDTH} ${DAY_CANDLE_HEIGHT}`}
            aria-hidden="true"
        >
            <line
                x1={zeroX}
                y1={2}
                x2={zeroX}
                y2={DAY_CANDLE_HEIGHT - 2}
                stroke="#d1d6db"
                strokeWidth={1}
            />
            {showHighBar && (
                <line
                    x1={zeroX}
                    y1={cy}
                    x2={highX}
                    y2={cy}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeLinecap="round"
                />
            )}
            {showClose && closeX !== null && (
                <circle cx={closeX} cy={cy} r={2.5} fill={closeColor} />
            )}
        </svg>
    );
}
