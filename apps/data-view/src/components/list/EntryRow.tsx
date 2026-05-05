"use client";

import { useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";
import {
    formatPercent,
    formatKrwShort,
    riseFallClass,
} from "@/components/format/number";
import { AmountDistribution } from "./AmountDistribution";
import styles from "./EntryRow.module.css";

interface Props {
    row: ThemeRowData;
}

export function EntryRow({ row }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [hoverAmount, setHoverAmount] = useState(false);
    const open = useChartModalStore((s) => s.open);

    const { entry, self, themeName, selfRank, themeSize, peers } = row;

    const handleStockClick = () => {
        open({
            stockCode: self.stockCode,
            stockName: self.stockName,
            tradeDate: entry.tradeDate,
            tradeTime: entry.tradeTime,
        });
    };

    return (
        <div className={styles.rowGroup}>
            <div className={styles.row}>
                {/* 좌측: 식별 */}
                <div className={styles.identityCol}>
                    <button
                        type="button"
                        className={styles.rankBtn}
                        onClick={() => setExpanded((v) => !v)}
                        title={`#${themeName} 펼치기`}
                    >
                        <span className={styles.rank}>{selfRank}</span>
                        <span className={styles.rankSlash}>/{themeSize}</span>
                        <span className={styles.themeChip}>#{themeName}</span>
                    </button>
                    <button
                        type="button"
                        className={styles.stockBtn}
                        onClick={handleStockClick}
                    >
                        <span className={styles.stockName}>{self.stockName}</span>
                        <span className={styles.stockCode}>{self.stockCode}</span>
                    </button>
                    <span className={styles.tradeTime}>{entry.tradeTime}</span>
                </div>

                {/* 우측: 지표 */}
                <div className={styles.metricsCol}>
                    <MetricChangeRate value={self.closeRate} />
                    <MetricDayHigh
                        dayHighRate={self.dayHighRate}
                        pullback={self.pullbackFromHigh}
                        minutesSince={self.minutesSinceDayHigh}
                    />
                    <MetricAmount
                        cumulative={self.cumulativeAmount}
                        currentMinute={self.currentMinuteAmount}
                        tradeTime={entry.tradeTime}
                        onHover={setHoverAmount}
                    />
                </div>
            </div>

            {/* 거래대금 분포 hover 표시 */}
            {hoverAmount && self.amountDistribution && (
                <AmountDistribution distribution={self.amountDistribution} />
            )}

            {/* 테마 내 종목 펼침 */}
            {expanded && (
                <div className={styles.peerList}>
                    {peers.length === 0 ? (
                        <div className={styles.peerEmpty}>같은 테마 종목 없음</div>
                    ) : (
                        peers.map((p, idx) => (
                            <PeerRow
                                key={p.stockCode}
                                peer={p}
                                rank={idx + 1 >= selfRank ? idx + 2 : idx + 1}
                                tradeDate={entry.tradeDate}
                                tradeTime={entry.tradeTime}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function MetricChangeRate({ value }: { value: number | null }) {
    return (
        <div className={styles.metric}>
            <span className={`tabular ${riseFallClass(value)} ${styles.metricMain}`}>
                {formatPercent(value)}
            </span>
        </div>
    );
}

function MetricDayHigh({
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

function MetricAmount({
    cumulative,
    currentMinute,
    tradeTime,
    onHover,
}: {
    cumulative: string | null;
    currentMinute: string | null;
    tradeTime: string;
    onHover: (v: boolean) => void;
}) {
    return (
        <div
            className={`${styles.metric} ${styles.metricAmount}`}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
        >
            <span className={`tabular ${styles.metricMain}`}>
                {formatKrwShort(cumulative)}
            </span>
            <span className={styles.metricSub}>
                <span className="tabular">{tradeTime.slice(0, 5)}</span>
                <span className={styles.dot}>·</span>
                <span className="tabular">{formatKrwShort(currentMinute)}</span>
            </span>
        </div>
    );
}

/* ===== 테마 내 동반 종목 ===== */

function PeerRow({
    peer,
    rank,
    tradeDate,
    tradeTime,
}: {
    peer: StockMetricsDTO;
    rank: number;
    tradeDate: string;
    tradeTime: string;
}) {
    const [hoverAmount, setHoverAmount] = useState(false);
    const open = useChartModalStore((s) => s.open);

    const handleClick = () => {
        open({
            stockCode: peer.stockCode,
            stockName: peer.stockName,
            tradeDate,
            tradeTime,
        });
    };

    return (
        <div className={styles.peerRowGroup}>
            <div className={styles.peerRow}>
                <div className={styles.identityCol}>
                    <span className={styles.peerRank}>{rank}</span>
                    <button
                        type="button"
                        className={styles.stockBtn}
                        onClick={handleClick}
                    >
                        <span className={styles.stockName}>{peer.stockName}</span>
                        <span className={styles.stockCode}>{peer.stockCode}</span>
                    </button>
                </div>
                <div className={styles.metricsCol}>
                    <MetricChangeRate value={peer.closeRate} />
                    <MetricDayHigh
                        dayHighRate={peer.dayHighRate}
                        pullback={peer.pullbackFromHigh}
                        minutesSince={peer.minutesSinceDayHigh}
                    />
                    <MetricAmount
                        cumulative={peer.cumulativeAmount}
                        currentMinute={peer.currentMinuteAmount}
                        tradeTime={tradeTime}
                        onHover={setHoverAmount}
                    />
                </div>
            </div>
            {hoverAmount && peer.amountDistribution && (
                <AmountDistribution distribution={peer.amountDistribution} />
            )}
        </div>
    );
}
