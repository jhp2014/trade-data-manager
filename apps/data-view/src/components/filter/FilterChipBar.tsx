"use client";

import styles from "./FilterChipBar.module.css";

interface FilterChip {
    id: string;
    label: string;
}

interface Props {
    chips: FilterChip[];
    onClearOne: (chipId: string) => void;
    onClearAll: () => void;
    panelOpen: boolean;
    onTogglePanel: () => void;
}

export function FilterChipBar({
    chips,
    onClearOne,
    onClearAll,
    panelOpen,
    onTogglePanel,
}: Props) {
    return (
        <div className={styles.bar}>
            <div className={styles.chips}>
                {chips.map((chip) => (
                    <span key={chip.id} className={styles.chip}>
                        {chip.label}
                        <button
                            type="button"
                            className={styles.chipRemove}
                            onClick={() => onClearOne(chip.id)}
                            aria-label={`필터 제거: ${chip.label}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
                {chips.length === 0 && (
                    <span className={styles.empty}>적용된 필터 없음</span>
                )}
            </div>

            <div className={styles.actions}>
                {chips.length > 0 && (
                    <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={onClearAll}
                    >
                        모두 지우기
                    </button>
                )}
                <button
                    type="button"
                    className={`${styles.toggleBtn} ${panelOpen ? styles.toggleBtnActive : ""}`}
                    onClick={onTogglePanel}
                >
                    {panelOpen ? "필터 접기 ▲" : "필터 펼치기 ▼"}
                </button>
            </div>
        </div>
    );
}
