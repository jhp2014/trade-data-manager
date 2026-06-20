"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import { parseHypExpr, searchCasesByExpr, unknownRefs } from "@/services/hypExpr";
import { aggregateOutcomes } from "@/services/outcomeAgg";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { useOutcomeTypes } from "@/stores/outcomeTypes";
import { useWorkbench } from "@/stores/workbench";
import styles from "./WorkingSetRail.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function GearIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
 * 상단 작업셋 탭 레일. 월별/시트/Done(snapshot)/History/Filter 를 한 줄에서 토글한다.
 * Filter 탭이 활성이면 그 우측에 불리언식 입력 컨트롤(건수·저장·불러오기)이 펼쳐진다.
 * 우측 끝에는 설정(⚙) 버튼.
 */
export function WorkingSetRail() {
    const filterMode = useWorkbench((s) => s.filterMode);
    const mode = useWorkbench((s) => s.mode);
    const month = useWorkbench((s) => s.month);
    const sheetTab = useWorkbench((s) => s.sheetTab);
    const selectWorkingSet = useWorkbench((s) => s.selectWorkingSet);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const openSettings = useWorkbench((s) => s.openSettings);
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);
    const openSavedFilter = useWorkbench((s) => s.openSavedFilter);
    const outcomeOptions = useOutcomeTypes((s) => s.options);
    const { filters } = useSavedFilters();
    const inputRef = useRef<HTMLInputElement>(null);

    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });

    const parsed = useMemo(
        () => (expr.trim() !== "" ? parseHypExpr(expr) : null),
        [expr],
    );
    const results = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return null;
        return searchCasesByExpr(snap, parsed.expr);
    }, [snapshot.data, parsed]);
    const resultCount = results?.length ?? null;
    const agg = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !results || results.length === 0) return null;
        return aggregateOutcomes({
            caseIds: results.map((r) => r.caseId),
            cases: snap.cases,
            options: outcomeOptions,
        });
    }, [snapshot.data, results, outcomeOptions]);
    const unknownCodes = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return [];
        return unknownRefs(parsed.expr, snap.hypotheses.map((h) => h.code));
    }, [snapshot.data, parsed]);

    const isWs = filterMode === "workingset";
    const filterOpen = filterMode === "boolean";
    const error = parsed && !parsed.ok ? parsed.error : null;
    const showStatus = expr.trim() !== "";
    const monthLabel = month.replace("-", ".");

    // Filter 탭으로 진입하면 입력창에 포커스.
    useEffect(() => {
        if (filterOpen) inputRef.current?.focus();
    }, [filterOpen]);

    return (
        <div className={styles.rail}>
            <div className={styles.tabs}>
                {/* 5개 탭은 세그먼트 컨트롤처럼 하나로 묶인다. 선택 탭은 accent 배경. */}
                <div className={styles.group}>
                    <button
                        className={cx(styles.tab, isWs && mode.kind === "review-month" && styles.on)}
                        onClick={() => selectWorkingSet({ kind: "review-month", month })}
                    >
                        {monthLabel}
                    </button>
                    <button
                        className={cx(styles.tab, isWs && mode.kind === "sheet" && styles.on)}
                        onClick={() => selectWorkingSet({ kind: "sheet", tab: sheetTab })}
                    >
                        {sheetTab ?? "시트"}
                    </button>
                    <button
                        className={cx(styles.tab, isWs && mode.kind === "snapshot" && styles.on)}
                        onClick={() => selectWorkingSet({ kind: "snapshot" })}
                    >
                        Done
                    </button>
                    <button
                        className={cx(styles.tab, filterMode === "history" && styles.on)}
                        onClick={() => setFilterMode("history")}
                    >
                        History
                    </button>
                    <button
                        className={cx(styles.tab, filterOpen && styles.on)}
                        onClick={() => setFilterMode("boolean")}
                    >
                        Filter
                    </button>
                </div>

                {/* Filter 탭 활성 시 우측에 식 입력 컨트롤이 펼쳐진다(고정 폭). */}
                <div className={cx(styles.filterControls, filterOpen && styles.filterControlsOpen)}>
                    <div className={cx(styles.filterBox, error && styles.filterBoxError)}>
                        {showStatus &&
                            (error ? (
                                <span className={styles.errBadge} title={error}>
                                    오류
                                </span>
                            ) : (
                                <span
                                    className={cx(styles.countBadge, unknownCodes.length > 0 && styles.countWarn)}
                                    title={
                                        unknownCodes.length > 0
                                            ? `알 수 없는 코드: ${unknownCodes.join(", ")}`
                                            : undefined
                                    }
                                >
                                    {resultCount ?? 0}건
                                </span>
                            ))}
                        <input
                            ref={inputRef}
                            className={styles.expr}
                            value={expr}
                            onChange={(e) => setExpr(e.target.value)}
                            placeholder="코드를 & | ! 로 조합 · 노드 우클릭"
                            spellCheck={false}
                            autoComplete="off"
                            tabIndex={filterOpen ? 0 : -1}
                            aria-hidden={!filterOpen}
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
                        tabIndex={filterOpen ? 0 : -1}
                    >
                        <SaveIcon />
                    </button>
                    <button
                        className={styles.iconBtnSm}
                        onClick={() => openSavedFilter("load")}
                        disabled={filters.length === 0}
                        title="저장된 필터 불러오기"
                        aria-label="저장된 필터 불러오기"
                        tabIndex={filterOpen ? 0 : -1}
                    >
                        <LoadIcon />
                    </button>

                    {agg && agg.items.length > 0 && (
                        <div className={styles.agg} title={`결과 ${agg.total}건의 outcome 집계`}>
                            {agg.items.map((it) => (
                                <span
                                    key={it.key}
                                    className={styles.aggPill}
                                    data-color={it.color ?? undefined}
                                >
                                    <span className={styles.aggLabel}>{it.label}</span>
                                    <span className={styles.aggNum}>{it.count}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <button
                className={styles.settings}
                onClick={openSettings}
                title="작업대 설정"
                aria-label="작업대 설정"
            >
                <GearIcon />
            </button>
        </div>
    );
}
