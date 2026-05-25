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
 *  - row 클릭 → 차트 모달이 위에 뜨고, 닫아도 이 모달은 유지됨
 *    (ChartModal / PeerListModal 은 각각 독립 store 라 자연스럽게 동작)
 *  - ESC: PeerListModal 만 닫는다. ChartModal 이 떠있으면 ChartModal 이
 *    먼저 ESC 를 받도록 가드.
 */
export function PeerListModal() {
    const target = usePeerListModalStore((s) => s.target);
    const close = usePeerListModalStore((s) => s.close);
    const chartTarget = useChartModalStore((s) => s.target);

    const isOpen = !!target;

    // body scroll lock 은 스택 방식으로 ChartModal 과 안전하게 공존
    useBodyScrollLock(isOpen);

    const handleEsc = useCallback(() => {
        // ChartModal 이 떠있으면 ChartModal 이 ESC 를 가져가도록 양보
        if (useChartModalStore.getState().target !== null) return;
        close();
    }, [close]);

    useShortcut("Escape", handleEsc, { enabled: isOpen });

    if (!target) return null;

    const metricsGrid = buildMetricsGridTemplate(target.hasOptions);

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
}: {
    entry: PeerListEntry;
    tradeDate: string;
    tradeTime: string;
    themeId: string;
    hasOptions: boolean;
    metricsGrid: string;
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
                        open({
                            stockCode: member.stockCode,
                            stockName: member.stockName,
                            tradeDate,
                            tradeTime,
                            themeId,
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
