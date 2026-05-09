"use client";

import { useEffect, useRef, useState } from "react";
import type { OptionMeta } from "@/lib/options/optionRegistry";

type OptionFilter =
    | { key: string; mode: "anyOf"; values: string[] }
    | { key: string; mode: "contains"; needle: string };
import styles from "../inputs.module.css";

interface Props {
    optionKey: string;
    meta: OptionMeta;
    filter: OptionFilter | null;
    onChange: (next: OptionFilter | null) => void;
}

export function OptionRow({ optionKey, meta, filter, onChange }: Props) {
    const mode = filter?.mode ?? meta.defaultMode;

    const handleToggleMode = () => {
        if (mode === "anyOf") {
            onChange({ key: optionKey, mode: "contains", needle: "" });
        } else {
            onChange({ key: optionKey, mode: "anyOf", values: [] });
        }
    };

    return (
        <div className={styles.row}>
            <label className={styles.label}>{optionKey}</label>
            <div className={styles.optionBody}>
                {mode === "contains" ? (
                    <ContainsInput
                        optionKey={optionKey}
                        needle={filter?.mode === "contains" ? filter.needle : ""}
                        onChange={onChange}
                    />
                ) : (
                    <AnyOfPicker
                        optionKey={optionKey}
                        meta={meta}
                        values={filter?.mode === "anyOf" ? filter.values : []}
                        onChange={onChange}
                    />
                )}
                <button
                    type="button"
                    className={styles.modeToggle}
                    onClick={handleToggleMode}
                    title={mode === "anyOf" ? "부분일치(contains) 모드로 전환" : "다중선택(anyOf) 모드로 전환"}
                >
                    {mode === "anyOf" ? "Aa" : "≡"}
                </button>
            </div>
        </div>
    );
}

function ContainsInput({
    optionKey,
    needle,
    onChange,
}: {
    optionKey: string;
    needle: string;
    onChange: (next: OptionFilter | null) => void;
}) {
    return (
        <input
            className={`${styles.input} ${styles.inputFlex}`}
            type="text"
            placeholder="포함 문자열"
            value={needle}
            onChange={(e) => {
                const v = e.target.value;
                onChange(v ? { key: optionKey, mode: "contains", needle: v } : null);
            }}
            aria-label={`옵션 ${optionKey} 부분일치 필터`}
        />
    );
}

function AnyOfPicker({
    optionKey,
    meta,
    values,
    onChange,
}: {
    optionKey: string;
    meta: OptionMeta;
    values: string[];
    onChange: (next: OptionFilter | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [open]);

    const filtered = search
        ? meta.values.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
        : meta.values;

    const handleCheck = (v: string, checked: boolean) => {
        const next = checked ? [...values, v] : values.filter((x) => x !== v);
        onChange(next.length > 0 ? { key: optionKey, mode: "anyOf", values: next } : null);
    };

    const handleClear = () => {
        onChange(null);
    };

    return (
        <div className={styles.anyOfPicker} ref={rootRef}>
            <button
                type="button"
                className={`${styles.input} ${styles.inputFlex} ${styles.anyOfTrigger}`}
                onClick={() => setOpen((v) => !v)}
                aria-label={`옵션 ${optionKey} 다중선택`}
            >
                <span className={styles.anyOfChips}>
                    {values.length === 0 ? (
                        <span className={styles.anyOfPlaceholder}>선택 없음</span>
                    ) : (
                        values.map((v) => (
                            <span key={v} className={styles.anyOfChip}>
                                {v}
                                <span
                                    className={styles.anyOfChipX}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCheck(v, false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.stopPropagation();
                                            handleCheck(v, false);
                                        }
                                    }}
                                >
                                    ×
                                </span>
                            </span>
                        ))
                    )}
                </span>
                <span className={styles.anyOfCaret}>▾</span>
            </button>

            {open && (
                <div className={styles.anyOfPopover}>
                    {meta.values.length >= 8 && (
                        <input
                            className={`${styles.input} ${styles.anyOfSearch}`}
                            type="text"
                            placeholder="검색..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    )}
                    <div className={styles.anyOfList}>
                        {filtered.length === 0 ? (
                            <div className={styles.anyOfEmpty}>결과 없음</div>
                        ) : (
                            filtered.map((v) => (
                                <label key={v} className={styles.anyOfItem}>
                                    <input
                                        type="checkbox"
                                        checked={values.includes(v)}
                                        onChange={(e) => handleCheck(v, e.target.checked)}
                                    />
                                    {v}
                                </label>
                            ))
                        )}
                    </div>
                    {values.length > 0 && (
                        <button
                            type="button"
                            className={styles.anyOfClear}
                            onClick={handleClear}
                        >
                            선택 해제
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
