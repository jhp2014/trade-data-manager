"use client";

import { useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useHoverAnchor } from "@/hooks/useHoverAnchor";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";
import { RowHoverPanel } from "./RowHoverPanel";
import { COLUMNS, METRICS_GRID } from "./columns/definitions";
import styles from "./EntryRow.module.css";

interface Props {
    row: ThemeRowData;
}

export function EntryRow({ row }: Props) {
    const [expanded, setExpanded] = useState(false);
    const open = useChartModalStore((s) => s.open);
    const { anchor, bind } = useHoverAnchor();

    const { entry, self, themeName, selfRank, themeSize, peers } = row;
    const ctx = { tradeTime: entry.tradeTime };

    return (
        <div className={styles.rowGroup}>
            <div className={styles.row} {...bind}>
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
                        onClick={() =>
                            open({
                                stockCode: self.stockCode,
                                stockName: self.stockName,
                                tradeDate: entry.tradeDate,
                                tradeTime: entry.tradeTime,
                            })
                        }
                    >
                        <span className={styles.stockName}>{self.stockName}</span>
                        <span className={styles.stockCode}>{self.stockCode}</span>
                    </button>
                    <span className={styles.tradeTime}>{entry.tradeTime}</span>
                </div>

                <div
                    className={styles.metricsCol}
                    style={{ gridTemplateColumns: METRICS_GRID }}
                >
                    {COLUMNS.map((col) => (
                        <div key={col.id}>{col.render(self, ctx)}</div>
                    ))}
                </div>
            </div>

            <RowHoverPanel
                anchor={anchor}
                options={entry.options}
                sourceFile={entry.sourceFile}
                distribution={self.amountDistribution}
            />

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
    const { anchor, bind } = useHoverAnchor();
    const ctx = { tradeTime };

    return (
        <div className={styles.peerRowGroup}>
            <div
                className={styles.peerRow}
                {...bind}
            >
                <div className={styles.identityCol}>
                    <span className={styles.peerRank}>{rank}</span>
                    <button
                        type="button"
                        className={styles.stockBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            open({ stockCode: peer.stockCode, stockName: peer.stockName, tradeDate, tradeTime });
                        }}
                    >
                        <span className={styles.stockName}>{peer.stockName}</span>
                        <span className={styles.stockCode}>{peer.stockCode}</span>
                    </button>
                </div>
                <div
                    className={styles.metricsCol}
                    style={{ gridTemplateColumns: METRICS_GRID }}
                >
                    {COLUMNS.map((col) => (
                        <div key={col.id}>{col.render(peer, ctx)}</div>
                    ))}
                </div>
            </div>
            <RowHoverPanel
                anchor={anchor}
                options={{}}
                sourceFile=""
                distribution={peer.amountDistribution}
            />
        </div>
    );
}
