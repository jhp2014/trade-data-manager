"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { ControlBar } from "@/components/deck/ControlBar";
import { EntryRow } from "@/components/list/EntryRow";
import { EntryListHeader } from "@/components/list/EntryListHeader";
import { EmptyState } from "@/components/deck/EmptyState";
import { FilterChipBar } from "@/components/filter/FilterChipBar";
import { FilterPanel } from "@/components/filter/FilterPanel";
import { ChartModal } from "@/components/chart/ChartModal";
import type { ThemeRowData, LoadedDecksDTO } from "@/types/deck";
import { loadDeckAction } from "@/actions/deck";
import { applyFilters } from "@/lib/filter/applyFilters";
import { sortRows } from "@/lib/sort/sortRows";
import { useFilterState } from "@/hooks/useFilterState";
import { buildOptionRegistry } from "@/lib/options/optionRegistry";
import { useUiStore } from "@/stores/useUiStore";
import styles from "./Filtered.module.css";

interface Props {
    initialSubDir: string;
    initialResult:
    | { ok: true; data: LoadedDecksDTO; rows: ThemeRowData[] }
    | { ok: false; error: string };
}

export function FilteredClient({ initialSubDir, initialResult }: Props) {
    const [result, setResult] = useState(initialResult);
    const [pending, startTransition] = useTransition();
    const [panelOpen, setPanelOpen] = useState(false);

    const [dir, setDir] = useQueryState("dir", parseAsString.withDefault(""));
    const {
        filterValues,
        optionFilters,
        setFilterValue,
        setOptionFilters,
        clearAll,
        clearOne,
        activeChips,
    } = useFilterState();
    const initVisibleOptionKeysIfEmpty = useUiStore((s) => s.initVisibleOptionKeysIfEmpty);
    const visibleOptionKeys = useUiStore((s) => s.visibleOptionKeys);
    const setVisibleOptionKeys = useUiStore((s) => s.setVisibleOptionKeys);

    const handleLoad = (subDir: string) => {
        void setDir(subDir);
        startTransition(async () => {
            const res = await loadDeckAction(subDir);
            setResult(res);
        });
    };

    const allRows = useMemo(
        () => (result.ok ? result.rows : []),
        [result],
    );

    const filteredSortedRows = useMemo(
        () => sortRows(applyFilters(allRows, filterValues, optionFilters)),
        [allRows, filterValues, optionFilters],
    );

    const optionKeys = result.ok ? result.data.optionKeys : [];
    const allEntries = result.ok ? result.data.entries : [];

    const optionRegistry = useMemo(
        () => buildOptionRegistry(allEntries, optionKeys),
        [allEntries, optionKeys],
    );

    const optionKeysKey = optionKeys.join("|");
    useEffect(() => {
        // 1) 빈 상태면 기본값으로 초기화 (기존 동작 유지)
        initVisibleOptionKeysIfEmpty(optionKeys);

        // 2) 현재 CSV에 더 이상 존재하지 않는 stale 키 제거
        const validKeys = visibleOptionKeys.filter((k) => optionKeys.includes(k));
        if (validKeys.length !== visibleOptionKeys.length) {
            setVisibleOptionKeys(validKeys);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionKeysKey]);


    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Data View</h1>
            <p className={styles.subtitle}>
                Read Data From CSV Files
            </p>

            <ControlBar
                initialSubDir={dir || initialSubDir}
                loading={pending}
                summary={
                    result.ok
                        ? {
                            files: result.data.files.length,
                            entries: result.data.entries.length,
                            rows: allRows.length,
                            filteredCount: filteredSortedRows.length,
                            optionKeys: result.data.optionKeys,
                            duplicateCount: result.data.duplicateCount,
                        }
                        : undefined
                }
                onLoad={handleLoad}
            />

            <FilterChipBar
                chips={activeChips}
                onClearOne={clearOne}
                onClearAll={clearAll}
                panelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen((v) => !v)}
            />

            {panelOpen && (
                <FilterPanel
                    filterValues={filterValues}
                    setFilterValue={setFilterValue}
                    optionFilters={optionFilters}
                    setOptionFilters={setOptionFilters}
                    optionKeys={optionKeys}
                    optionRegistry={optionRegistry}
                />
            )}

            {!result.ok && (
                <EmptyState variant="error" title="덱 로드 실패" body={result.error} />
            )}

            {result.ok && filteredSortedRows.length === 0 && (
                <EmptyState
                    title="entry 없음"
                    body={
                        activeChips.length > 0
                            ? "현재 필터 조건에 맞는 항목이 없습니다."
                            : "이 폴더에는 csv 파일이 없거나 모든 entry가 비어있습니다."
                    }
                />
            )}

            {result.ok && filteredSortedRows.length > 0 && (
                <div className={styles.listArea}>
                    <EntryListHeader
                        optionKeys={optionKeys}
                        optionRegistry={optionRegistry}
                    />
                    <div className={styles.list}>
                        {filteredSortedRows.map((r, idx) => (
                            <EntryRow
                                key={`${r.entry.stockCode}|${r.entry.tradeDate}|${r.entry.tradeTime}|${r.themeId}|${idx}`}
                                row={r}
                                optionKeys={optionKeys}
                            />
                        ))}
                    </div>
                </div>
            )}

            <ChartModal />
        </div>
    );
}
