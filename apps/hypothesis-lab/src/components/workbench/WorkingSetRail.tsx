"use client";

import { useEffect, useRef, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useWorkbench, type CaseView } from "@/stores/workbench";
import { DateRangePicker } from "./DateRangePicker";
import { FilterBar } from "./FilterBar";
import styles from "./WorkingSetRail.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function GearIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v5h-5" />
        </svg>
    );
}

function CaretIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

function ListIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
        </svg>
    );
}

function ExpandIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 6l6 6-6 6M13 6l6 6-6 6" />
        </svg>
    );
}

function CollapseIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 6l-6 6 6 6M11 6l-6 6 6 6" />
        </svg>
    );
}

const VIEW_LABELS: Record<CaseView, string> = { all: "All", todo: "Todo", done: "Done" };
const VIEW_ORDER: CaseView[] = ["all", "todo", "done"];

/**
 * 좌열 상단 컨트롤 — 한 줄 압축.
 * 모드 드롭다운(클릭) · All/Todo/Done 순환 · 모드별 컨텍스트 · 전역 액션을 한 줄에.
 * Filter 식 입력은 토글되는 떠있는 오버레이(레일 아래)로 분리해 레이아웃을 밀지 않는다.
 * 선택 케이스 요약은 그래프 좌상단 오버레이로 분리.
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
    const history = useWorkbench((s) => s.history);
    const clearHistory = useWorkbench((s) => s.clearHistory);
    const openHistoryModal = useWorkbench((s) => s.openHistoryModal);
    const expr = useWorkbench((s) => s.expr);
    const selectWorkingSet = useWorkbench((s) => s.selectWorkingSet);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const openSettings = useWorkbench((s) => s.openSettings);
    // 필터 입력 플라이아웃 열림 — store(단축키 f 로도 연다).
    const filterOpen2 = useWorkbench((s) => s.filterOpen);
    const setFilterOpen2 = useWorkbench((s) => s.setFilterOpen);
    const queryClient = useQueryClient();
    const [navOpen, setNavOpen] = useState(false);
    const navRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement>(null);

    // 현재 작업셋(포인트/시트) 재조회. chart-review 새 타점·시트 변경 반영.
    const refreshing =
        useIsFetching({ queryKey: ["workingSet"] }) +
        useIsFetching({ queryKey: ["historyCases"] }) +
        useIsFetching({ queryKey: ["snapshot"] });
    function refresh() {
        queryClient.invalidateQueries({ queryKey: ["workingSet"] });
        queryClient.invalidateQueries({ queryKey: ["historyCases"] });
        queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    }

    const isWs = filterMode === "workingset";
    const isDate = isWs && mode.kind === "review-range";
    const isSheet = isWs && mode.kind === "sheet";
    const isHistory = filterMode === "history";
    const filterMode2 = filterMode === "boolean";

    const MODES = [
        { key: "date", label: "Date", active: isDate, onSelect: () => selectWorkingSet({ kind: "review-range", ...range }) },
        { key: "sheet", label: "Sheet", active: isSheet, onSelect: () => selectWorkingSet({ kind: "sheet", tab: sheetTab }) },
        { key: "history", label: "History", active: isHistory, onSelect: () => setFilterMode("history") },
        { key: "filter", label: "Filter", active: filterMode2, onSelect: () => setFilterMode("boolean") },
    ];
    const current = MODES.find((m) => m.active) ?? MODES[0];

    function cycleView() {
        setView(VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length]);
    }

    // nav 메뉴 바깥 클릭 시 닫기.
    useEffect(() => {
        if (!navOpen) return;
        function onDown(e: MouseEvent) {
            if (!navRef.current?.contains(e.target as Node)) setNavOpen(false);
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [navOpen]);

    // 필터 오버레이 바깥(레일 밖) 클릭 시 닫기.
    useEffect(() => {
        if (!filterOpen2) return;
        function onDown(e: MouseEvent) {
            if (!railRef.current?.contains(e.target as Node)) setFilterOpen2(false);
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [filterOpen2]);

    return (
        <div className={styles.rail} ref={railRef}>
            <div className={styles.row}>
                {/* 모드 드롭다운(클릭). */}
                <div className={styles.nav} ref={navRef}>
                    <button
                        className={styles.navTrigger}
                        onClick={() => setNavOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={navOpen}
                    >
                        {current.label}
                        <span className={cx(styles.caret, navOpen && styles.caretOpen)}>
                            <CaretIcon />
                        </span>
                    </button>
                    {navOpen && (
                        <div className={styles.navMenu} role="menu">
                            {MODES.map((m) => (
                                <button
                                    key={m.key}
                                    className={cx(styles.navItem, m.active && styles.navItemOn)}
                                    role="menuitem"
                                    onClick={() => {
                                        m.onSelect();
                                        setNavOpen(false);
                                    }}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 뷰 순환 — 전 모드 공통. */}
                <button className={styles.viewCycle} onClick={cycleView} title="All / Todo / Done 전환">
                    {VIEW_LABELS[view]}
                    <span className={styles.viewNum}>
                        {viewCounts[view]}
                        {view !== "all" && <span className={styles.viewTotal}>/{viewCounts.all}</span>}
                    </span>
                </button>

                {/* 모드별 컨텍스트. */}
                <div className={styles.scope}>
                    {isDate && <DateRangePicker range={range} setRange={setRange} />}
                    {isSheet && (
                        <button className={styles.scopeBtn} onClick={openSettings} title="클릭하여 시트 탭 변경">
                            {sheetTab ?? "기본 탭"}
                        </button>
                    )}
                    {isHistory && (
                        <div className={styles.histActions}>
                            <button
                                className={styles.scopeIcon}
                                onClick={openHistoryModal}
                                title="이력 목록 보기"
                                aria-label="이력 목록 보기"
                            >
                                <ListIcon />
                            </button>
                            <button
                                className={styles.scopeIcon}
                                onClick={clearHistory}
                                disabled={history.length === 0}
                                title="이력 비우기"
                                aria-label="이력 비우기"
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    )}
                    {filterMode2 && (
                        <div className={styles.filterCtl}>
                            <button
                                className={cx(
                                    styles.searchBtn,
                                    expr.trim() !== "" && styles.searchActive,
                                )}
                                onClick={() => setFilterOpen2(!filterOpen2)}
                                title={filterOpen2 ? "입력창 접기" : "필터 식 입력"}
                                aria-label="필터 식 입력"
                                aria-expanded={filterOpen2}
                            >
                                {filterOpen2 ? (
                                    <CollapseIcon />
                                ) : (
                                    <>
                                        <span className={styles.iconRest}>
                                            <SearchIcon />
                                        </span>
                                        <span className={styles.iconHover}>
                                            <ExpandIcon />
                                        </span>
                                    </>
                                )}
                            </button>
                            {filterOpen2 && (
                                <div className={styles.filterFlyout}>
                                    <FilterBar />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <span className={styles.spacer} />

                {/* 전역 액션. */}
                <button
                    className={cx(styles.iconBtn, refreshing > 0 && styles.spinning)}
                    onClick={refresh}
                    disabled={refreshing > 0}
                    title="현재 작업셋 다시 불러오기 (포인트·시트)"
                    aria-label="작업셋 새로고침"
                >
                    <RefreshIcon />
                </button>
                <button
                    className={styles.iconBtn}
                    onClick={openSettings}
                    title="작업대 설정"
                    aria-label="작업대 설정"
                >
                    <GearIcon />
                </button>
            </div>
        </div>
    );
}
