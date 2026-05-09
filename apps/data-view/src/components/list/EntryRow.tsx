"use client";

import { useState, useEffect } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useUiStore } from "@/stores/useUiStore";
import { useHoverAnchor } from "@/hooks/useHoverAnchor";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";
import type { FilterInstance, RowDerived } from "@/lib/filter/kinds/types";
import { chipLabelForPredicate } from "@/lib/member/predicate";
import type { MemberPredicate } from "@/lib/member/predicate";
import { RowHoverPanel } from "./RowHoverPanel";
import { OptionsCell } from "./OptionsCell";
import { COLUMNS } from "./columns/definitions";
import { buildMetricsGridTemplate } from "@/lib/columns/gridTemplate";
import styles from "./EntryRow.module.css";

interface Props {
    row: ThemeRowData;
    optionKeys: string[];
    derived: RowDerived;
    activeInstances: FilterInstance[];
}

type ExpandedView =
    | null
    | { kind: "theme" }
    | { kind: "active"; instanceId: string };

export function EntryRow({ row, optionKeys, derived, activeInstances }: Props) {
    const [expandedView, setExpandedView] = useState<ExpandedView>(null);
    const open = useChartModalStore((s) => s.open);
    const modalTarget = useChartModalStore((s) => s.target);
    const { anchor, bind } = useHoverAnchor();
    const visibleOptionKeys = useUiStore((s) => s.visibleOptionKeys);

    const { entry, self, themeName, selfRank, themeSize, peers } = row;
    const ctx = { tradeTime: entry.tradeTime };
    const hasOptions = optionKeys.length > 0;
    const metricsGrid = buildMetricsGridTemplate(hasOptions);

    const activePools = derived.activePools;
    const hasActivePools = activePools.length > 0;

    const toggleView = (next: ExpandedView) => {
        setExpandedView((cur) => {
            if (cur === null) return next;
            if (next === null) return null;
            if (next.kind === "theme" && cur.kind === "theme") return null;
            if (
                next.kind === "active" &&
                cur.kind === "active" &&
                cur.instanceId === next.instanceId
            ) return null;
            return next;
        });
    };

    // 단축키: Space = 차트 열기, 1/2/3... = active 풀 토글 (없으면 theme 펼침)
    useEffect(() => {
        if (!anchor) return;
        const handler = (e: KeyboardEvent) => {
            if (modalTarget !== null) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                open({
                    stockCode: self.stockCode,
                    stockName: self.stockName,
                    tradeDate: entry.tradeDate,
                    tradeTime: entry.tradeTime,
                });
                return;
            }

            const num = parseInt(e.key, 10);
            if (isNaN(num) || num < 1) return;

            if (!hasActivePools) {
                if (num === 1) toggleView({ kind: "theme" });
            } else {
                const pool = activePools[num - 1];
                if (pool) toggleView({ kind: "active", instanceId: pool.instanceId });
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchor, open, self, entry, hasActivePools, activePools, modalTarget]);

    // 펼침 패널 데이터 결정
    let expandedPeers: StockMetricsDTO[] | null = null;
    let expandedHeader: string | null = null;

    if (expandedView !== null) {
        if (expandedView.kind === "theme") {
            expandedPeers = peers;
        } else {
            const pool = activePools.find((p) => p.instanceId === expandedView.instanceId);
            if (pool) {
                expandedPeers = pool.members;
                const poolIdx = activePools.indexOf(pool);
                const instIdx = activeInstances.findIndex((i) => i.id === pool.instanceId);
                const label = instIdx >= 0
                    ? chipLabelForPredicate(
                        (activeInstances[instIdx].value as { predicate: MemberPredicate }).predicate,
                      )
                    : "";
                expandedHeader = `Active #${poolIdx + 1}: ${label} 통과 ${pool.poolSize}종목`;
            }
        }
    }

    return (
        <div className={styles.rowGroup}>
            <div className={styles.row} {...bind}>
                <div className={styles.identityCol}>
                    {/* Active 풀이 없으면 기존 rankBtn, 있으면 Act 칩 목록 */}
                    {!hasActivePools ? (
                        <button
                            type="button"
                            className={styles.rankBtn}
                            onClick={() => toggleView({ kind: "theme" })}
                            title={`#${themeName} 펼치기`}
                        >
                            <span className={styles.rank}>{selfRank}</span>
                            <span className={styles.rankSlash}>/{themeSize}</span>
                            <span className={styles.themeChip}>#{themeName}</span>
                        </button>
                    ) : (
                        <div className={styles.activeChips}>
                            {activePools.map((pool, i) => {
                                const isExpanded =
                                    expandedView?.kind === "active" &&
                                    expandedView.instanceId === pool.instanceId;
                                const rankLabel =
                                    pool.selfRank !== null
                                        ? `${pool.selfRank}/${pool.poolSize}`
                                        : `-/${pool.poolSize}`;
                                return (
                                    <button
                                        key={pool.instanceId}
                                        type="button"
                                        className={`${styles.activeChip} ${isExpanded ? styles.activeChipActive : ""}`}
                                        onClick={() =>
                                            toggleView({ kind: "active", instanceId: pool.instanceId })
                                        }
                                        title={`Act #${i + 1} 풀 펼치기`}
                                    >
                                        <span className={styles.activeChipLabel}>Act#{i + 1}</span>
                                        <span className={styles.activeChipRank}>{rankLabel}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

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

                    {!hasActivePools && row.allThemesForEntry.length > 1 && (
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
                    )}

                    <span className={styles.tradeTime}>
                        {entry.tradeDate} {entry.tradeTime}
                    </span>
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

            {expandedPeers !== null && (
                <div className={styles.peerList}>
                    {expandedHeader && (
                        <div className={styles.peerListHeader}>{expandedHeader}</div>
                    )}
                    {expandedPeers.length === 0 ? (
                        <div className={styles.peerEmpty}>
                            {expandedView?.kind === "active" ? "조건 통과 종목 없음" : "같은 테마 종목 없음"}
                        </div>
                    ) : (
                        expandedPeers.map((p, idx) => {
                            const rank =
                                expandedView?.kind === "theme"
                                    ? idx + 1 >= selfRank
                                        ? idx + 2
                                        : idx + 1
                                    : idx + 1;
                            return (
                                <PeerRow
                                    key={p.stockCode}
                                    peer={p}
                                    rank={rank}
                                    tradeDate={entry.tradeDate}
                                    tradeTime={entry.tradeTime}
                                    hasOptions={hasOptions}
                                />
                            );
                        })
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
