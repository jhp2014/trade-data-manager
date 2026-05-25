"use client";

import { useEffect } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useUiStore } from "@/stores/useUiStore";
import { useHoveredRowStore } from "@/stores/useHoveredRowStore";
import {
    usePeerListModalStore,
    buildThemeEntries,
    buildActiveEntries,
} from "@/stores/usePeerListModalStore";
import { useHoverAnchor } from "@/hooks/useHoverAnchor";
import type { ThemeRowData } from "@/types/deck";
import type { FilterInstance, RowDerived } from "@/lib/filter/kinds/types";
import { rowKey } from "@/lib/filter/derived";
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

/**
 * 한 row 를 렌더한다.
 *
 * 변경 사항 (가상화 도입 준비):
 *  - 펼침(expandedView) 로직 제거 → `PeerListModal` 로 분리
 *    (동적 높이 회피, virtualizer 안정성 ↑)
 *  - 키보드 핸들러 등록 제거 → `useGlobalRowShortcuts` 가 글로벌로 1개만 처리
 *    이 row 는 hover 시 `useHoveredRowStore` 에만 자기 정보를 등록
 *  - row 자체는 사실상 고정 높이 (allThemes wrap 으로 약간 변동 가능)
 */
export function EntryRow({ row, optionKeys, derived, activeInstances }: Props) {
    const open = useChartModalStore((s) => s.open);
    const openPeerList = usePeerListModalStore((s) => s.open);
    const { anchor, bind } = useHoverAnchor();
    const visibleOptionKeys = useUiStore((s) => s.visibleOptionKeys);
    const setHovered = useHoveredRowStore((s) => s.setHovered);
    const clearHoveredIfMatches = useHoveredRowStore((s) => s.clearIfMatches);

    const { entry, self, themeName, selfRank, themeSize } = row;
    const ctx = { tradeTime: entry.tradeTime };
    const hasOptions = optionKeys.length > 0;
    const metricsGrid = buildMetricsGridTemplate(hasOptions);

    const activePools = derived.activePools;
    const hasActivePools = activePools.length > 0;
    const activePoolsForModal = activePools.map((p) => ({
        instanceId: p.instanceId,
        memberStockCodes: p.members.map((m) => m.stockCode),
    }));

    const key = rowKey(row);

    // 가상화 환경에서 row 가 mouseleave 없이 unmount 될 수 있으므로
    // 안전망으로 unmount 시 자기 자신이면 hovered 를 해제한다.
    useEffect(() => {
        return () => {
            clearHoveredIfMatches(key);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // hover panel 표시는 useHoverAnchor 의 150ms delay 를 따르지만,
    // 단축키(Space=차트) 는 즉시 반응해야 하므로 hovered store 등록은
    // delay 없이 mouseenter 시점에 바로 수행한다.
    const handleMouseEnter = (e: React.MouseEvent) => {
        bind.onMouseEnter(e);
        setHovered({ key, row, activePools });
    };

    const handleMouseLeave = (e: React.MouseEvent) => {
        bind.onMouseLeave(e);
        clearHoveredIfMatches(key);
    };

    const openThemeModal = () => {
        openPeerList({
            kind: "theme",
            headerLabel: `#${themeName}  ${themeSize}종목`,
            entries: buildThemeEntries(row),
            tradeDate: entry.tradeDate,
            tradeTime: entry.tradeTime,
            themeId: row.themeId,
            hasOptions,
            sourceRow: {
                stockCode: self.stockCode,
                themeId: row.themeId,
                tradeDate: entry.tradeDate,
                tradeTime: entry.tradeTime,
            },
        });
    };

    const openActiveModal = (poolIdx: number) => {
        const pool = activePools[poolIdx];
        if (!pool) return;
        const instIdx = activeInstances.findIndex((i) => i.id === pool.instanceId);
        const label = instIdx >= 0
            ? chipLabelForPredicate(
                (activeInstances[instIdx].value as { predicate: MemberPredicate }).predicate,
            )
            : "";
        openPeerList({
            kind: "active",
            headerLabel: `Active #${poolIdx + 1}: ${label}  ${pool.poolSize}종목`,
            entries: buildActiveEntries(self.stockCode, pool.members),
            tradeDate: entry.tradeDate,
            tradeTime: entry.tradeTime,
            themeId: row.themeId,
            hasOptions,
            sourceRow: {
                stockCode: self.stockCode,
                themeId: row.themeId,
                tradeDate: entry.tradeDate,
                tradeTime: entry.tradeTime,
            },
        });
    };

    return (
        <div
            className={styles.row}
            ref={bind.ref}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className={styles.identityCol}>
                {/* 1. 기본 테마 등수 — 항상 표시 */}
                <button
                    type="button"
                    className={styles.rankBtn}
                    onClick={openThemeModal}
                    title={`#${themeName} 펼치기`}
                >
                    <span className={styles.rank}>{selfRank}</span>
                    <span className={styles.rankSlash}>/{themeSize}</span>
                    <span className={styles.themeChip}>#{themeName}</span>
                </button>

                {/* 2. Active 풀이 있으면 추가 표시 */}
                {hasActivePools && (
                    <div className={styles.activeChips}>
                        {activePools.map((pool, i) => {
                            const rankLabel =
                                pool.selfRank !== null
                                    ? `${pool.selfRank}/${pool.poolSize}`
                                    : `-/${pool.poolSize}`;
                            return (
                                <button
                                    key={pool.instanceId}
                                    type="button"
                                    className={styles.activeChip}
                                    onClick={() => openActiveModal(i)}
                                    title={`Act #${i + 1} 풀 펼치기`}
                                >
                                    <span className={styles.activeChipLabel}>Act#{i + 1}</span>
                                    <span className={styles.activeChipRank}>{rankLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 3. 종목 버튼 */}
                <button
                    type="button"
                    className={styles.stockBtn}
                    onClick={() =>
                        open({
                            stockCode: self.stockCode,
                            stockName: self.stockName,
                            tradeDate: entry.tradeDate,
                            tradeTime: entry.tradeTime,
                            themeId: row.themeId,
                            activePools: activePoolsForModal,
                            priceLines: entry.priceLines,
                        })
                    }
                >
                    <span className={styles.stockName}>{self.stockName}</span>
                    <span className={styles.stockCode}>{self.stockCode}</span>
                </button>

                {/* 4. allThemes — 항상 평가 */}
                {row.allThemesForEntry.length > 1 && (
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

            <RowHoverPanel
                anchor={anchor}
                options={entry.options}
                sourceFile={entry.sourceFile}
                distribution={self.amountDistributionBucket}
            />
        </div>
    );
}
