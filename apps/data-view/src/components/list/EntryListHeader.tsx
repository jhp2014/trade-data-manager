"use client";

import { useRef, useState } from "react";
import type { OptionMeta } from "@/lib/options/optionRegistry";
import { useUiStore } from "@/stores/useUiStore";
import { COLUMNS } from "./columns/definitions";
import { buildMetricsGridTemplate } from "@/lib/columns/gridTemplate";
import { OptionVisibilityPicker } from "./OptionVisibilityPicker";
import styles from "./EntryListHeader.module.css";

interface Props {
    optionKeys: string[];
    optionRegistry: Map<string, OptionMeta>;
}

export function EntryListHeader({ optionKeys }: Props) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const visibleOptionKeys = useUiStore((s) => s.visibleOptionKeys);
    const toggleOptionKey = useUiStore((s) => s.toggleOptionKey);
    const setVisibleOptionKeys = useUiStore((s) => s.setVisibleOptionKeys);

    const hasOptions = optionKeys.length > 0;
    const metricsGrid = buildMetricsGridTemplate(hasOptions);

    return (
        <div className={styles.header}>
            <div className={styles.identityLabels}>
                <span className={styles.label}>종목 / 시각</span>
            </div>
            <div
                className={styles.metricsLabels}
                style={{ gridTemplateColumns: metricsGrid }}
            >
                {COLUMNS.map((col) => (
                    <span key={col.id} className={styles.label}>
                        {col.label}
                    </span>
                ))}
                {hasOptions && (
                    <div className={styles.optionHeaderCell} ref={containerRef}>
                        <button
                            type="button"
                            className={`${styles.optionHeaderBtn} ${pickerOpen ? styles.optionHeaderActive : ""}`}
                            onClick={() => setPickerOpen((v) => !v)}
                        >
                            옵션 ⚙
                        </button>
                        {pickerOpen && (
                            <OptionVisibilityPicker
                                optionKeys={optionKeys}
                                visibleOptionKeys={visibleOptionKeys}
                                onToggle={toggleOptionKey}
                                onClearAll={() => setVisibleOptionKeys([])}
                                onClose={() => setPickerOpen(false)}
                                containerRef={containerRef}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
