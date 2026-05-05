"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AmountDistribution } from "./AmountDistribution";
import styles from "./RowHoverPanel.module.css";

interface Props {
    anchor: DOMRect | null;
    options: Record<string, string>;
    sourceFile: string;
    distribution: Record<number, number> | null;
}

export function RowHoverPanel({ anchor, options, sourceFile, distribution }: Props) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted || !anchor) return null;

    const PANEL_W = 480;
    const margin = 8;
    let top = anchor.top - margin - 200;       // 위쪽 우선
    if (top < 60) top = anchor.bottom + margin; // 위 공간 부족 → 아래
    let left = anchor.left + 24;
    if (left + PANEL_W > window.innerWidth - 12) {
        left = window.innerWidth - PANEL_W - 12;
    }

    const optionEntries = Object.entries(options);

    return createPortal(
        <div
            className={styles.panel}
            style={{ top, left, width: PANEL_W }}
            onMouseEnter={(e) => e.stopPropagation()}
        >
            {optionEntries.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>옵션</div>
                    <div className={styles.chips}>
                        {optionEntries.map(([k, v]) => (
                            <span key={k} className={styles.chip}>
                                <span className={styles.chipKey}>{k}</span>
                                <span className={styles.chipVal}>{v}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {distribution && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>거래대금 분포</div>
                    <AmountDistribution distribution={distribution} />
                </div>
            )}

            <div className={styles.source}>{sourceFile}</div>
        </div>,
        document.body
    );
}
