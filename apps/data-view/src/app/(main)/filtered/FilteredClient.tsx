"use client";

import { useEffect, useState, useTransition, useMemo, useRef } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ControlBar } from "@/components/deck/ControlBar";
import { EntryRow } from "@/components/list/EntryRow";
import { EntryListHeader } from "@/components/list/EntryListHeader";
import { EmptyState } from "@/components/deck/EmptyState";
import { FilterChipBar } from "@/components/filter/FilterChipBar";
import { FilterPanel } from "@/components/filter/FilterPanel";
import { ChartModal } from "@/components/chart/ChartModal";
import { PeerListModal } from "@/components/list/PeerListModal";
import type { ThemeRowData, LoadedDecksDTO } from "@/types/deck";
import { loadDeckAction } from "@/actions/deck";
import { applyFilters } from "@/lib/filter/applyFilters";
import { computeRowDerived, rowKey } from "@/lib/filter/derived";
import { KINDS } from "@/lib/filter/kinds";
import { sortRows } from "@/lib/sort/sortRows";
import { useFilterState } from "@/hooks/useFilterState";
import { useGlobalRowShortcuts } from "@/hooks/useGlobalRowShortcuts";
import { buildOptionRegistry } from "@/lib/options/optionRegistry";
import { useUiStore } from "@/stores/useUiStore";
import styles from "./Filtered.module.css";

interface Props {
    initialSubDir: string;
    initialResult:
    | { ok: true; data: LoadedDecksDTO; rows: ThemeRowData[] }
    | { ok: false; error: string };
}

/** 한 row 의 기본 높이 추정값 (px). measureElement 가 실측해서 보정한다. */
const ESTIMATED_ROW_HEIGHT = 60;
/** 뷰포트 위/아래로 미리 마운트해둘 row 개수. */
const VIRTUALIZER_OVERSCAN = 8;

export function FilteredClient({ initialSubDir, initialResult }: Props) {
    const [result, setResult] = useState(initialResult);
    const [pending, startTransition] = useTransition();
    const [panelOpen, setPanelOpen] = useState(false);

    const [dir, setDir] = useQueryState("dir", parseAsString.withDefault(""));

    const optionKeys = useMemo(
        () => (result.ok ? result.data.optionKeys : []),
        [result],
    );
    const allEntries = useMemo(
        () => (result.ok ? result.data.entries : []),
        [result],
    );

    const optionRegistry = useMemo(
        () => buildOptionRegistry(allEntries, optionKeys),
        [allEntries, optionKeys],
    );

    const {
        instances,
        ctx,
        addInstance,
        updateInstance,
        removeInstance,
        clearAll,
        activeChips,
    } = useFilterState(optionKeys, optionRegistry);

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

    // activeMembersInTheme 인스턴스만 추려서 derived 계산
    const activeMemberInstances = useMemo(
        () => instances.filter((i) => i.kind === "activeMembersInTheme"),
        [instances],
    );

    const derivedMap = useMemo(
        () => computeRowDerived(allRows, activeMemberInstances),
        [allRows, activeMemberInstances],
    );

    const filteredSortedRows = useMemo(
        () => sortRows(applyFilters(allRows, instances, derivedMap, KINDS)),
        [allRows, instances, derivedMap],
    );

    const optionKeysKey = optionKeys.join("|");
    useEffect(() => {
        initVisibleOptionKeysIfEmpty(optionKeys);
        const validKeys = visibleOptionKeys.filter((k) => optionKeys.includes(k));
        if (validKeys.length !== visibleOptionKeys.length) {
            setVisibleOptionKeys(validKeys);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionKeysKey]);

    // 글로벌 단축키 등록 (Space=차트, 1=테마펼침, 2..N=Active펼침)
    useGlobalRowShortcuts({
        activeInstances: activeMemberInstances,
    });

    /* ───────── 가상화 셋업 ───────── */
    const scrollParentRef = useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
        count: filteredSortedRows.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => ESTIMATED_ROW_HEIGHT,
        overscan: VIRTUALIZER_OVERSCAN,
        // 안정적인 식별자 (idx 미포함) — 정렬/필터 변경 시 React 재사용 가능
        getItemKey: (index) => rowKey(filteredSortedRows[index]),
    });

    // 필터/정렬 변경으로 행 집합이 바뀌면 스크롤을 최상단으로 리셋한다.
    // virtualizer 내부 캐시도 함께 무효화하여 잘못된 측정 결과를 사용하지 않도록 한다.
    //
    // 키 구성:
    //   - dir: 덱 폴더 변경
    //   - filteredSortedRows 의 개수 + 첫/마지막 row 식별자: 행 집합 변경
    //   - instances 직렬화: 필터 조건 변경 (행 집합이 우연히 동일해도 감지)
    // 행 전체를 직렬화하지 않고 인스턴스를 직렬화하여 비용을 낮춘다.
    const resetKey = useMemo(() => {
        if (filteredSortedRows.length === 0) return `empty::${dir}`;
        const first = filteredSortedRows[0];
        const last = filteredSortedRows[filteredSortedRows.length - 1];
        const instancesKey = instances
            .map((i) => `${i.id}:${i.kind}:${JSON.stringify(i.value)}`)
            .join("|");
        return [
            dir,
            filteredSortedRows.length,
            rowKey(first),
            rowKey(last),
            instancesKey,
        ].join("::");
    }, [dir, filteredSortedRows, instances]);

    useEffect(() => {
        if (scrollParentRef.current) {
            scrollParentRef.current.scrollTop = 0;
        }
        rowVirtualizer.measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const virtualItems = rowVirtualizer.getVirtualItems();
    const totalHeight = rowVirtualizer.getTotalSize();

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
                onClearOne={removeInstance}
                onClearAll={clearAll}
                panelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen((v) => !v)}
            />

            {panelOpen && (
                <FilterPanel
                    instances={instances}
                    ctx={ctx}
                    addInstance={addInstance}
                    updateInstance={updateInstance}
                    removeInstance={removeInstance}
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
                    <EntryListHeader optionKeys={optionKeys} />
                    <div
                        ref={scrollParentRef}
                        className={styles.list}
                        data-virtual-scroll-container="true"
                    >
                        <div
                            className={styles.listInner}
                            style={{ height: `${totalHeight}px` }}
                        >
                            {virtualItems.map((virtualItem) => {
                                const r = filteredSortedRows[virtualItem.index];
                                return (
                                    <div
                                        key={virtualItem.key}
                                        data-index={virtualItem.index}
                                        ref={rowVirtualizer.measureElement}
                                        className={styles.virtualRow}
                                        style={{
                                            transform: `translateY(${virtualItem.start}px)`,
                                        }}
                                    >
                                        <EntryRow
                                            row={r}
                                            optionKeys={optionKeys}
                                            derived={derivedMap.get(rowKey(r)) ?? { activePools: [] }}
                                            activeInstances={activeMemberInstances}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <ChartModal />
            <PeerListModal />
        </div>
    );
}
