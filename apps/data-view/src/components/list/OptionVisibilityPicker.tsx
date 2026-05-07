"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./EntryListHeader.module.css";

interface Props {
    optionKeys: string[];
    visibleOptionKeys: string[];
    onToggle: (key: string) => void;
    onClearAll: () => void;
    onClose: () => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export function OptionVisibilityPicker({
    optionKeys,
    visibleOptionKeys,
    onToggle,
    onClearAll,
    onClose,
    containerRef,
}: Props) {
    const [search, setSearch] = useState("");

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [onClose, containerRef]);

    const filtered = search
        ? optionKeys.filter((k) => k.toLowerCase().includes(search.toLowerCase()))
        : optionKeys;

    return (
        <div className={styles.popover}>
            {optionKeys.length >= 8 && (
                <input
                    className={styles.popoverSearch}
                    type="text"
                    placeholder="검색..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                />
            )}
            <div className={styles.popoverList}>
                {filtered.length === 0 ? (
                    <div className={styles.popoverEmpty}>결과 없음</div>
                ) : (
                    filtered.map((k) => (
                        <label key={k} className={styles.popoverItem}>
                            <input
                                type="checkbox"
                                checked={visibleOptionKeys.includes(k)}
                                onChange={() => onToggle(k)}
                            />
                            {k}
                        </label>
                    ))
                )}
            </div>
            {visibleOptionKeys.length > 0 && (
                <button
                    type="button"
                    className={styles.popoverClear}
                    onClick={onClearAll}
                >
                    전체 해제
                </button>
            )}
        </div>
    );
}
