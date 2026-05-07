"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { parseOptionValue } from "@/lib/options/parseOptionValue";
import { AmountDistribution } from "./AmountDistribution";
import styles from "./RowHoverPanel.module.css";

interface Props {
    anchor: DOMRect | null;
    options?: Record<string, string>;
    sourceFile: string;
    distribution: Record<number, number> | null;
}

export function RowHoverPanel({ anchor, options, sourceFile, distribution }: Props) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted || !anchor) return null;

    const optionEntries = options
        ? Object.entries(options).filter(([, v]) => v !== "")
        : [];
    const hasOptions = optionEntries.length > 0;
    const hasDist = distribution && Object.keys(distribution).length > 0;
    const hasSource = sourceFile && sourceFile.length > 0;
    if (!hasOptions && !hasDist && !hasSource) return null;

    const PANEL_W = Math.min(640, Math.max(440, Math.floor(window.innerWidth * 0.30)));
    const margin = 8;

    let left = anchor.left + 24;
    if (left + PANEL_W > window.innerWidth - 12) {
        left = window.innerWidth - PANEL_W - 12;
    }
    if (left < 12) left = 12;

    const aboveSpace = anchor.top - margin;
    const belowSpace = window.innerHeight - anchor.bottom - margin;
    const useBelow = aboveSpace < 180 && belowSpace > aboveSpace;

    const positionStyle: React.CSSProperties = useBelow
        ? { top: anchor.bottom + margin, left, width: PANEL_W }
        : { bottom: window.innerHeight - anchor.top + margin, left, width: PANEL_W };

    return createPortal(
        <div
            className={styles.panel}
            style={positionStyle}
            onMouseEnter={(e) => e.stopPropagation()}
        >
            {hasOptions && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>옵션</div>
                    <table className={styles.optionTable}>
                        <tbody>
                            {optionEntries.map(([k, v]) => {
                                const tokens = parseOptionValue(v);
                                return (
                                    <tr key={k} className={styles.optionRow}>
                                        <td className={styles.optionRowKey}>{k}</td>
                                        <td className={styles.optionRowValue}>
                                            {tokens.length > 0
                                                ? tokens.join(" · ")
                                                : v}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {hasDist && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>거래대금 발생 횟수</div>
                    <AmountDistribution distribution={distribution!} />
                </div>
            )}

            {hasSource && <div className={styles.source}>{sourceFile}</div>}
        </div>,
        document.body
    );
}
