"use client";

import { useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useUiStore } from "@/stores/useUiStore";
import { useHoverAnchor } from "@/hooks/useHoverAnchor";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";
import { RowHoverPanel } from "./RowHoverPanel";
import { OptionsCell } from "./OptionsCell";
import { COLUMNS } from "./columns/definitions";
import { buildMetricsGridTemplate } from "@/lib/columns/gridTemplate";
import styles from "./EntryRow.module.css";

interface Props {
    row: ThemeRowData;
    optionKeys: string[];
}

export function EntryRow({ row, optionKeys }: Props) {
    const [expanded, setExpanded] = useState(false);
    const open = useChartModalStore((s) => s.open);
    const { anchor, bind } = useHoverAnchor();
    const visibleOptionKeys = useUiStore((s) => s.visibleOptionKeys);

    const { entry, self, themeName, selfRank, themeSize, peers } = row;
    const ctx = { tradeTime: entry.tradeTime };
    const hasOptions = optionKeys.length > 0;
    const metricsGrid = buildMetricsGridTemplate(hasOptions);

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

                    <div className={styles.allThemes}>
                        {row.allThemesForEntry.map((t) => (
                            <span
                                key={t.themeId}
                                className={`${styles.allThemeChip} ${t.themeId === row.themeId ? styles.allThemeChipCurrent : ""}`}
                            >
                                #{t.themeName}
                            </span>
                        ))}
                    </div>
                    <span className={styles.tradeTime}>{entry.tradeDate} {entry.tradeTime}</span>
                </div>

                <div
                    className={styles.metricsCol}
                    style={{ gridTemplateColumns: metricsGrid }}
                >
                    {COLUMNS.map((col) => (
                        <div key={col.id}>{col.render(self, ctx)}</div>
                    ))}
                    {hasOptions && (
                        <OptionsCell options={entry.options} visibleKeys={visibleOptionKeys} />
                    )}
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
                                hasOptions={hasOptions}
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
    hasOptions,
}: {
    peer: StockMetricsDTO;
    rank: number;
    tradeDate: string;
    tradeTime: string;
    hasOptions: boolean;
}) {
    const open = useChartModalStore((s) => s.open);
    const { anchor, bind } = useHoverAnchor();
    const ctx = { tradeTime };
    const metricsGrid = buildMetricsGridTemplate(hasOptions);

    return (
        <div className={styles.peerRowGroup}>
            <div className={styles.peerRow} {...bind}>
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
                    style={{ gridTemplateColumns: metricsGrid }}
                >
                    {COLUMNS.map((col) => (
                        <div key={col.id}>{col.render(peer, ctx)}</div>
                    ))}
                    {hasOptions && <div />}
                </div>
            </div>
            <RowHoverPanel
                anchor={anchor}
                sourceFile=""
                distribution={peer.amountDistribution}
            />
        </div>
    );
}
