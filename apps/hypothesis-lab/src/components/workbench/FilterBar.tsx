"use client";

import { useEffect, useMemo, useRef } from "react";
import { parseHypExpr } from "@/services/hypExpr";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { useWorkbench } from "@/stores/workbench";
import styles from "./FilterBar.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function SaveIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
        </svg>
    );
}

function LoadIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    );
}

/**
 * 불리언 필터 입력 바 — 입력부 + 액션부(저장/불러오기)를 하나의 필드로 통합.
 * 액션부는 배경색으로 구분. 결과 건수·집계는 그래프 상태로 분리.
 */
export function FilterBar() {
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);
    const openSavedFilter = useWorkbench((s) => s.openSavedFilter);
    const { filters } = useSavedFilters();
    const inputRef = useRef<HTMLInputElement>(null);

    const error = useMemo(() => {
        if (expr.trim() === "") return null;
        const p = parseHypExpr(expr);
        return p.ok ? null : p.error;
    }, [expr]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <div className={cx(styles.field, error && styles.fieldError)}>
            {error && (
                <span className={styles.errBadge} title={error}>
                    오류
                </span>
            )}
            <input
                ref={inputRef}
                className={styles.expr}
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                placeholder="예) A & B | !C"
                spellCheck={false}
                autoComplete="off"
            />
            {expr !== "" && (
                <button
                    className={styles.clear}
                    onClick={() => setExpr("")}
                    tabIndex={-1}
                    title="식 지우기"
                    aria-label="식 지우기"
                >
                    ×
                </button>
            )}

            {/* 액션부 — 배경색으로 입력부와 구분. */}
            <div className={styles.actions}>
                <button
                    className={styles.slBtn}
                    onClick={() => openSavedFilter("save")}
                    disabled={expr.trim() === "" || !!error}
                    title="현재 필터 저장"
                    aria-label="현재 필터 저장"
                >
                    <SaveIcon />
                </button>
                <span className={styles.slDivider} />
                <button
                    className={styles.slBtn}
                    onClick={() => openSavedFilter("load")}
                    disabled={filters.length === 0}
                    title="저장된 필터 불러오기"
                    aria-label="저장된 필터 불러오기"
                >
                    <LoadIcon />
                </button>
            </div>
        </div>
    );
}
