"use client";

import { useRef, useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";
import {
    formatPercent,
    formatKrwShort,
    riseFallClass,
} from "@/components/format/number";
import { RowHoverPanel } from "./RowHoverPanel";
import styles from "./EntryRow.module.css";

interface Props {
    row: ThemeRowData;
}

const HOVER_OPEN_DELAY = 150;

export function EntryRow({ row }: Props) {
    const [expanded, setExpanded] = useState(false);
    const open = useChartModalStore((s) => s.open);

    const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const openTimerRef = useRef<number | null>(null);

    const { entry, self, themeName, selfRank, themeSize, peers } = row;

    const handleStockClick = () => {
        open({
            stockCode: self.stockCode,
            stockName: self.stockName,
            tradeDate: entry.tradeDate,
            tradeTime: entry.tradeTime,
        });
    };

    const handleRowEnter = () => {
        if (openTimerRef.current !== null) return;
        openTimerRef.current = window.setTimeout(() => {
            openTimerRef.current = null;
            if (rowRef.current) {
                setHoverAnchor(rowRef.current.getBoundingClientRect());
            }
        }, HOVER_OPEN_DELAY);
    };

    const handleRowLeave = () => {
        if (openTimerRef.current !== null) {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
        setHoverAnchor(null);
    };

    return (
        <div
            className={styles.rowGroup}
            onMouseEnter={handleRowEnter}
            onMouseLeave={handleRowLeave}
        >
            <div className={styles.row} ref={rowRef}>
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
                    />
                </div>
            </div>

            {/* 행 hover 시 portal 모달 */}
            <RowHoverPanel
                anchor={hoverAnchor}
                options={entry.options}
                sourceFile={entry.sourceFile}
                distribution={self.amountDistribution}
            />

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
}: {
    cumulative: string | null;
    currentMinute: string | null;
    tradeTime: string;
}) {
    return (
        <div className={styles.metric}>
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
    const open = useChartModalStore((s) => s.open);

    const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const openTimerRef = useRef<number | null>(null);

    const handleClick = () => {
        open({
            stockCode: peer.stockCode,
            stockName: peer.stockName,
            tradeDate,
            tradeTime,
        });
    };

    const handleEnter = () => {
        if (openTimerRef.current !== null) return;
        openTimerRef.current = window.setTimeout(() => {
            openTimerRef.current = null;
            if (rowRef.current) {
                setHoverAnchor(rowRef.current.getBoundingClientRect());
            }
        }, HOVER_OPEN_DELAY);
    };

    const handleLeave = () => {
        if (openTimerRef.current !== null) {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
        setHoverAnchor(null);
    };

    return (
        <div
            className={styles.peerRowGroup}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            <div className={styles.peerRow} ref={rowRef}>
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
                    />
                </div>
            </div>
            <RowHoverPanel
                anchor={hoverAnchor}
                options={{}}
                sourceFile=""
                distribution={peer.amountDistribution}
            />
        </div>
    );
}
