"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import { parseHypExpr, searchCasesByExpr, unknownRefs } from "@/services/hypExpr";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { useWorkbench } from "@/stores/workbench";
import styles from "./FilterBar.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/** 접힘(작업셋)일 때 ">"(펼치기), 펼침(불리언)일 때 "<"(접기). */
function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={open ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
        </svg>
    );
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
 * 그래프 좌상단 불리언 필터 위젯. 필터 아이콘 토글 — 켜면(accent) 입력창이 오른쪽으로
 * 펼쳐지며 불리언 모드, 끄면 작업셋 모드(닫힐 때도 줄어드는 애니메이션). 결과 건수는
 * 아이콘과 입력창 사이에 표시. 식 파싱·평가는 자체 계산(snapshot 캐시 공유).
 */
export function FilterBar() {
    const filterMode = useWorkbench((s) => s.filterMode);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);
    const openSavedFilter = useWorkbench((s) => s.openSavedFilter);
    const { filters } = useSavedFilters();
    const inputRef = useRef<HTMLInputElement>(null);

    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });

    const parsed = useMemo(
        () => (expr.trim() !== "" ? parseHypExpr(expr) : null),
        [expr],
    );
    const resultCount = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return null;
        return searchCasesByExpr(snap, parsed.expr).length;
    }, [snapshot.data, parsed]);
    const unknownCodes = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return [];
        return unknownRefs(parsed.expr, snap.hypotheses.map((h) => h.code));
    }, [snapshot.data, parsed]);

    const open = filterMode === "boolean";
    const error = parsed && !parsed.ok ? parsed.error : null;
    const showStatus = expr.trim() !== "";

    // 펼칠 때 입력창에 포커스(닫힘 애니메이션을 위해 입력창은 항상 마운트한다).
    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    return (
        <div className={cx(styles.bar, open && styles.barOpen)}>
            <button
                className={styles.toggle}
                onClick={() => setFilterMode(open ? "workingset" : "boolean")}
                title={open ? "불리언 필터 접기 (작업셋 모드)" : "불리언 필터 펼치기"}
                aria-label="불리언 필터 토글"
                aria-pressed={open}
            >
                <ChevronIcon open={open} />
            </button>
            {showStatus && (
                <span className={styles.status}>
                    {error ? (
                        <span className={styles.err} title={error}>
                            식 오류
                        </span>
                    ) : (
                        <span
                            className={cx(styles.count, unknownCodes.length > 0 && styles.countWarn)}
                            title={
                                unknownCodes.length > 0
                                    ? `알 수 없는 코드: ${unknownCodes.join(", ")}`
                                    : undefined
                            }
                        >
                            {resultCount ?? 0}건
                        </span>
                    )}
                </span>
            )}
            <div className={styles.exprWrap}>
                <input
                    ref={inputRef}
                    className={cx(styles.expr, error && styles.exprError)}
                    value={expr}
                    onChange={(e) => setExpr(e.target.value)}
                    placeholder="가설 코드를 &(AND) |(OR) !(NOT) 로 조합 · 노드 우클릭으로 추가"
                    spellCheck={false}
                    autoComplete="off"
                    tabIndex={open ? 0 : -1}
                    aria-hidden={!open}
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
            </div>
            <button
                className={styles.iconBtnSm}
                onClick={() => openSavedFilter("save")}
                disabled={expr.trim() === "" || !!error}
                title="현재 필터 저장"
                aria-label="현재 필터 저장"
                tabIndex={open ? 0 : -1}
            >
                <SaveIcon />
            </button>
            <button
                className={styles.iconBtnSm}
                onClick={() => openSavedFilter("load")}
                disabled={filters.length === 0}
                title="저장된 필터 불러오기"
                aria-label="저장된 필터 불러오기"
                tabIndex={open ? 0 : -1}
            >
                <LoadIcon />
            </button>
        </div>
    );
}
