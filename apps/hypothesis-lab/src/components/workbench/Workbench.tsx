"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    linkCaseAction,
    loadCasesAction,
    loadSnapshotAction,
    loadWorkingSetAction,
    unlinkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import { useSelection } from "@/stores/selection";
import { tabKeyOf, useWorkbench } from "@/stores/workbench";
import { useSelectedCaseCopyShortcut } from "@/hooks/useSelectedCaseCopyShortcut";
import { usePasteCaseShortcut } from "@/hooks/usePasteCaseShortcut";
import type { WorkingSetCase } from "@/services/workingSet";
import { parseHypExpr, searchCasesByExpr } from "@/services/hypExpr";
import { HypothesisGraph } from "@/components/graph/HypothesisGraph";
import { CaseRail } from "./CaseRail";
import { WorkingSetRail } from "./WorkingSetRail";
import { HypothesisPanel } from "./HypothesisPanel";
import { HypothesisModal } from "./HypothesisModal";
import { HistoryModal } from "./HistoryModal";
import { SavedFilterModal } from "./SavedFilterModal";
import { WorkbenchSettingsModal } from "./WorkbenchSettingsModal";
import styles from "./Workbench.module.css";

function toCaseInput(c: WorkingSetCase): CaseSnapshotInput {
    return {
        caseId: c.caseId,
        stockCode: c.stockCode,
        stockName: c.stockName,
        tradeDate: c.tradeDate,
        tradeTime: c.tradeTime,
    };
}

export function Workbench() {
    const queryClient = useQueryClient();
    const mode = useWorkbench((s) => s.mode);
    const filterMode = useWorkbench((s) => s.filterMode);
    const expr = useWorkbench((s) => s.expr);
    const history = useWorkbench((s) => s.history);
    const addHistory = useWorkbench((s) => s.addHistory);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const positions = useWorkbench((s) => s.positions);
    const setPosition = useWorkbench((s) => s.setPosition);
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);
    const modalHypothesisId = useSelection((s) => s.modalHypothesisId);

    const workingSet = useQuery({
        queryKey: ["workingSet", mode],
        queryFn: () => loadWorkingSetAction(mode),
        enabled: filterMode === "workingset",
    });
    const historyCases = useQuery({
        queryKey: ["historyCases", history],
        queryFn: () => loadCasesAction(history),
        enabled: filterMode === "history" && history.length > 0,
    });
    const snapshot = useQuery({
        queryKey: ["snapshot"],
        queryFn: () => loadSnapshotAction(),
    });

    // 불리언 모드: 식을 파싱해 snapshot.cases 전체에 평가하고, 결과 caseId 를
    // snapshot.cases 의 값으로 되살려 레일 행으로 만든다(서버 왕복 없이 클라 파생).
    const parsed = useMemo(
        () => (filterMode === "boolean" && expr.trim() !== "" ? parseHypExpr(expr) : null),
        [filterMode, expr],
    );
    const booleanCases = useMemo<WorkingSetCase[]>(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return [];
        const byId = new Map(snap.cases.map((c) => [c.caseId, c]));
        return searchCasesByExpr(snap, parsed.expr).flatMap((r) => {
            const c = byId.get(r.caseId);
            if (!c) return [];
            return [
                {
                    caseId: c.caseId,
                    stockCode: c.stockCode,
                    stockName: c.stockName,
                    tradeDate: c.tradeDate,
                    tradeTime: c.tradeTime,
                    existsInReview: true,
                    linkedHypothesisIds: r.linkedHypothesisIds,
                },
            ];
        });
    }, [snapshot.data, parsed]);

    const railCases =
        filterMode === "boolean"
            ? booleanCases
            : filterMode === "history"
              ? (historyCases.data ?? [])
              : (workingSet.data ?? []);
    const railLoading =
        filterMode === "boolean"
            ? snapshot.isLoading
            : filterMode === "history"
              ? historyCases.isLoading
              : workingSet.isLoading;

    const tabKey = tabKeyOf(filterMode, mode);

    // 레일이 로드되면 선택을 복구한다. 현재 선택이 레일에 있으면 유지하고,
    // 없으면 이 탭에 저장된 위치(positions[tabKey])로, 그것도 없으면 첫 케이스로.
    useEffect(() => {
        if (railCases.length === 0) return;
        if (selectedCaseId && railCases.some((c) => c.caseId === selectedCaseId)) return;
        const saved = positions[tabKey];
        const target =
            saved && railCases.some((c) => c.caseId === saved) ? saved : railCases[0].caseId;
        selectCase(target);
    }, [railCases, selectedCaseId, selectCase, positions, tabKey]);

    // 현재 선택을 탭별 위치로 저장(탭을 다시 열면 이어서 탐색). 레일에 실재하는
    // 선택만 기록해, 탭 전환 직후의 옛 선택으로 덮어쓰지 않는다.
    useEffect(() => {
        if (!selectedCaseId) return;
        if (!railCases.some((c) => c.caseId === selectedCaseId)) return;
        setPosition(tabKey, selectedCaseId);
    }, [selectedCaseId, railCases, tabKey, setPosition]);

    // Ctrl+V 로 caseId 탐색: 항상 History 에 적재하고, 현재 레일에 있으면 그 자리에서
    // 선택, 없으면 History 탭으로 전환해 선택한다.
    const onPasteCase = useCallback(
        (caseId: string) => {
            addHistory(caseId);
            if (!railCases.some((c) => c.caseId === caseId)) setFilterMode("history");
            selectCase(caseId);
        },
        [railCases, addHistory, setFilterMode, selectCase],
    );
    usePasteCaseShortcut(onPasteCase);

    const selectedCase = railCases.find((c) => c.caseId === selectedCaseId) ?? null;
    useSelectedCaseCopyShortcut(selectedCase?.caseId ?? null);

    // 그래프 노드 체크박스 → 현재 케이스 연결/해제.
    const { mutate: linkMutate } = useMutation({
        mutationFn: (v: { hypothesisId: string; case: CaseSnapshotInput }) => linkCaseAction(v),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
        },
    });
    const { mutate: unlinkMutate } = useMutation({
        mutationFn: (v: { hypothesisId: string; caseId: string }) => unlinkCaseAction(v),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
        },
    });
    const handleToggleCaseLink = useCallback(
        (hypothesisId: string, link: boolean) => {
            if (!selectedCase) return;
            if (link) linkMutate({ hypothesisId, case: toCaseInput(selectedCase) });
            else unlinkMutate({ hypothesisId, caseId: selectedCase.caseId });
        },
        [selectedCase, linkMutate, unlinkMutate],
    );

    // a(이전) / d(다음) 으로 워킹셋 케이스 이동. 입력 중이거나 모달이 열려 있으면 무시.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (modalHypothesisId) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
            const key = e.key.toLowerCase();
            if (key !== "a" && key !== "d") return;
            if (railCases.length === 0) return;
            const idx = railCases.findIndex((c) => c.caseId === selectedCaseId);
            const cur = idx < 0 ? 0 : idx;
            const next = key === "a" ? cur - 1 : cur + 1;
            if (next < 0 || next >= railCases.length) return;
            selectCase(railCases[next].caseId);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [railCases, selectedCaseId, selectCase, modalHypothesisId]);

    // 케이스별 연결된 가설 수(카드 배지용).
    const linkedCountByCase = useMemo(() => {
        const m = new Map<string, number>();
        const snap = snapshot.data;
        if (!snap) return m;
        for (const hc of snap.hypothesisCases) {
            m.set(hc.caseId, (m.get(hc.caseId) ?? 0) + 1);
        }
        return m;
    }, [snapshot.data]);

    const linkedToSelectedCase = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !selectedCaseId) return [];
        return snap.hypothesisCases
            .filter((hc) => hc.caseId === selectedCaseId)
            .map((hc) => hc.hypothesisId);
    }, [snapshot.data, selectedCaseId]);

    return (
        <div className={styles.layout}>
            <WorkingSetRail />
            <div className={styles.rail}>
                <CaseRail
                    cases={railCases}
                    loading={railLoading}
                    linkedCountByCase={linkedCountByCase}
                />
            </div>
            <div className={styles.bottom}>
                <div className={styles.panel}>
                    <HypothesisPanel
                        snapshot={snapshot.data ?? null}
                        selectedCase={selectedCase}
                        expr={filterMode === "boolean" && parsed?.ok ? parsed.expr : null}
                    />
                </div>
                <div className={styles.graph}>
                    <HypothesisGraph
                        snapshot={snapshot.data ?? null}
                        highlightHypothesisIds={linkedToSelectedCase}
                        caseSelected={!!selectedCase}
                        onToggleCaseLink={handleToggleCaseLink}
                    />
                </div>
            </div>
            <WorkbenchSettingsModal />
            <HistoryModal />
            <SavedFilterModal />
            <HypothesisModal />
        </div>
    );
}
