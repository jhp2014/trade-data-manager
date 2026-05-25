"use client";

import { useCallback } from "react";
import { usePeerListModalStore } from "@/stores/usePeerListModalStore";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useShortcut } from "@/hooks/useShortcut";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHoverAnchor } from "@/hooks/useHoverAnchor";
import { COLUMNS } from "./columns/definitions";
import { buildMetricsGridTemplate } from "@/lib/columns/gridTemplate";
import { RowHoverPanel } from "./RowHoverPanel";
import type { PeerListEntry } from "@/stores/usePeerListModalStore";
import styles from "./PeerListModal.module.css";

/**
 * 펼침 영역(테마 peer / Active 풀)을 모달로 표시한다.
 *
 *  - 본인 행 포함, 순위 순서대로 표시
 *  - 본인 행은 accent 배경으로 강조
 *  - row 클릭 → 이 모달을 닫고 ChartModal 만 띄운다 (모달 1개 정책).
 *    ChartModal 의 테마 chip 으로 언제든 다른/같은 테마의 PeerListModal 로
 *    되돌아갈 수 있으므로, 둘이 동시에 떠 있는 상황을 만들지 않는다.
 *  - ESC: 단순히 PeerListModal 을 닫는다. 모달이 항상 1개이므로 가드 불필요.
 */
export function PeerListModal() {
    const target = usePeerListModalStore((s) => s.target);
    const close = usePeerListModalStore((s) => s.close);

    const isOpen = !!target;

    useBodyScrollLock(isOpen);

    const handleEsc = useCallback(() => {
        close();
    }, [close]);

    useShortcut("Escape", handleEsc, { enabled: isOpen });

    if (!target) return null;

    const metricsGrid = buildMetricsGridTemplate(target.hasOptions);
    const selfStockCode = target.sourceRow.stockCode;
    const sourcePriceLines = target.sourceRow.priceLines;

    return (
        <div className={styles.backdrop} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span
                            className={`${styles.headerChip} ${target.kind === "active" ? styles.headerChipActive : ""}`}
                        >
                            {target.headerChip}
                        </span>
                        {target.headerSubtitle && (
                            <span className={styles.headerSubtitle}>
                                {target.headerSubtitle}
                            </span>
                        )}
                        <span className={styles.headerCount}>
                            {target.count} 종목
                        </span>
                    </div>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={close}
                        aria-label="닫기"
                    >
                        ✕
                    </button>
                </header>

                <div className={styles.listHeader}>
                    <div className={styles.listHeaderIdentity}>
                        <span className={styles.listHeaderLabel}>종목</span>
                    </div>
                    <div
                        className={styles.listHeaderMetrics}
                        style={{ gridTemplateColumns: metricsGrid }}
                    >
                        {COLUMNS.map((col) => (
                            <span key={col.id} className={styles.listHeaderLabel}>
                                {col.label}
                            </span>
                        ))}
                        {target.hasOptions && <span />}
                    </div>
                </div>

                <div className={styles.body}>
                    {target.entries.length === 0 ? (
                        <div className={styles.emptyRow}>
                            {target.kind === "active"
                                ? "조건 통과 종목 없음"
                                : "같은 테마 종목 없음"}
                        </div>
                    ) : (
                        target.entries.map((e) => (
                            <PeerListRow
                                key={`${e.member.stockCode}|${e.rank}`}
                                entry={e}
                                tradeDate={target.tradeDate}
                                tradeTime={target.tradeTime}
                                themeId={target.themeId}
                                hasOptions={target.hasOptions}
                                metricsGrid={metricsGrid}
                                selfStockCode={selfStockCode}
                                sourcePriceLines={sourcePriceLines}
                                closeModal={close}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function PeerListRow({
    entry,
    tradeDate,
    tradeTime,
    themeId,
    hasOptions,
    metricsGrid,
    selfStockCode,
    sourcePriceLines,
    closeModal,
}: {
    entry: PeerListEntry;
    tradeDate: string;
    tradeTime: string;
    themeId: string;
    hasOptions: boolean;
    metricsGrid: string;
    selfStockCode: string;
    sourcePriceLines: Record<string, number[]> | undefined;
    closeModal: () => void;
}) {
    const open = useChartModalStore((s) => s.open);
    const { anchor, bind } = useHoverAnchor();
    const ctx = { tradeTime };

    const { member, rank, isSelf } = entry;

    return (
        <div
            className={`${styles.row} ${isSelf ? styles.rowSelf : ""}`}
            {...bind}
        >
            <div className={styles.identityCol}>
                <span className={`${styles.rank} ${isSelf ? styles.rankSelf : ""}`}>
                    {rank}
                </span>
                <button
                    type="button"
                    className={styles.stockBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        // 모달 1개 정책: PeerListModal 닫고 ChartModal 만 띄움
                        closeModal();
                        const isClickedSelf = member.stockCode === selfStockCode;
                        open({
                            stockCode: member.stockCode,
                            stockName: member.stockName,
                            tradeDate,
                            tradeTime,
                            themeId,
                            // self row 인 경우에만 sourceRow.priceLines 를 전달
                            priceLines: isClickedSelf ? sourcePriceLines : undefined,
                        });
                    }}
                >
                    <span className={styles.stockName}>{member.stockName}</span>
                    <span className={styles.stockCode}>{member.stockCode}</span>
                </button>
                {isSelf && <span className={styles.selfTag}>Main</span>}
            </div>
            <div
                className={styles.metricsCol}
                style={{ gridTemplateColumns: metricsGrid }}
            >
                {COLUMNS.map((col) => (
                    <div key={col.id}>{col.render(member, ctx)}</div>
                ))}
                {hasOptions && <div />}
            </div>

            <RowHoverPanel
                anchor={anchor}
                sourceFile=""
                distribution={member.amountDistributionBucket}
            />
        </div>
    );
}
