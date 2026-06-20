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

function SheetIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
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

const VIEW_LABELS: Record<"all" | "todo" | "done", string> = {
    all: "All",
    todo: "Todo",
    done: "Done",
};

/**
 * 상단 작업셋 탭 레일. Date/Sheet/History/Filter 를 한 줄에서 토글한다.
 * - Date/Sheet/History: 우측에 스코프 컨트롤(기간 입력·시트 탭명)과 All/Todo/Done 토글.
 * - Filter: 불리언식 입력 컨트롤(건수·저장·불러오기·집계).
 * 우측 끝에는 설정(⚙) 버튼.
 */
export function WorkingSetRail({
    viewCounts,
}: {
    viewCounts: { all: number; todo: number; done: number };
}) {
    const filterMode = useWorkbench((s) => s.filterMode);
    const mode = useWorkbench((s) => s.mode);
    const range = useWorkbench((s) => s.range);
    const setRange = useWorkbench((s) => s.setRange);
    const view = useWorkbench((s) => s.view);
    const setView = useWorkbench((s) => s.setView);
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
    const isDate = isWs && mode.kind === "review-range";
    const isSheet = isWs && mode.kind === "sheet";
    const isHistory = filterMode === "history";
    const filterOpen = filterMode === "boolean";
    const showViewToggle = isDate || isSheet || isHistory;
    const error = parsed && !parsed.ok ? parsed.error : null;
    const showStatus = expr.trim() !== "";

    // Filter 탭으로 진입하면 입력창에 포커스.
    useEffect(() => {
        if (filterOpen) inputRef.current?.focus();
    }, [filterOpen]);

    return (
        <div className={styles.rail}>
            <div className={styles.tabs}>
                {/* 4개 탭은 세그먼트 컨트롤처럼 하나로 묶인다. 선택 탭은 accent 배경. */}
                <div className={styles.group}>
                    <button
                        className={cx(styles.tab, isDate && styles.on)}
                        onClick={() => selectWorkingSet({ kind: "review-range", ...range })}
                    >
                        Date
                    </button>
                    <button
                        className={cx(styles.tab, isSheet && styles.on)}
                        onClick={() => selectWorkingSet({ kind: "sheet", tab: sheetTab })}
                    >
                        Sheet
                    </button>
                    <button
                        className={cx(styles.tab, isHistory && styles.on)}
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

                {/* All/Todo/Done 토글(탭 그룹 우측) + 탭별 부가정보(기간/시트). 한 묶음·내부 구분선. */}
                {showViewToggle && (
                    <div className={styles.scopeControls}>
                        <div className={styles.viewToggle}>
                            {(["all", "todo", "done"] as const).map((v) => (
                                <button
                                    key={v}
                                    className={cx(styles.viewBtn, view === v && styles.viewOn)}
                                    onClick={() => setView(v)}
                                >
                                    {VIEW_LABELS[v]}
                                    <span className={styles.viewNum}>{viewCounts[v]}</span>
                                </button>
                            ))}
                        </div>
                        {isDate && (
                            <div className={styles.range}>
                                <input
                                    type="date"
                                    className={styles.dateInput}
                                    value={range.from}
                                    max={range.to}
                                    onChange={(e) => setRange({ ...range, from: e.target.value })}
                                />
                                <span className={styles.rangeSep}>–</span>
                                <input
                                    type="date"
                                    className={styles.dateInput}
                                    value={range.to}
                                    min={range.from}
                                    onChange={(e) => setRange({ ...range, to: e.target.value })}
                                />
                            </div>
                        )}
                        {isSheet && (
                            <div className={styles.sheetField} title="설정에서 시트 탭 변경">
                                <SheetIcon />
                                <span className={styles.sheetName}>{sheetTab ?? "기본 탭(.env)"}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Filter 탭: 식 입력·저장/불러오기·집계를 한 바로 묶고 내부 구분선으로 나눈다. */}
                {filterOpen && (
                    <div className={cx(styles.filterBar, error && styles.filterBarError)}>
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
                        <span className={styles.barDivider} />
                        <button
                            className={styles.barBtn}
                            onClick={() => openSavedFilter("save")}
                            disabled={expr.trim() === "" || !!error}
                            title="현재 필터 저장"
                            aria-label="현재 필터 저장"
                        >
                            <SaveIcon />
                        </button>
                        <button
                            className={styles.barBtn}
                            onClick={() => openSavedFilter("load")}
                            disabled={filters.length === 0}
                            title="저장된 필터 불러오기"
                            aria-label="저장된 필터 불러오기"
                        >
                            <LoadIcon />
                        </button>

                        {agg && agg.items.length > 0 && (
                            <>
                                <span className={styles.barDivider} />
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
                            </>
                        )}
                    </div>
                )}
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
