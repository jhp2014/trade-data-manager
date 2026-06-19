"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    linkCaseAction,
    loadSnapshotAction,
    loadWorkingSetAction,
    unlinkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import { useSelection } from "@/stores/selection";
import { useWorkbench } from "@/stores/workbench";
import { useSelectedCaseCopyShortcut } from "@/hooks/useSelectedCaseCopyShortcut";
import type { WorkingSetCase } from "@/services/workingSet";
import { HypothesisGraph } from "@/components/graph/HypothesisGraph";
import { CaseRail } from "./CaseRail";
import { HypothesisPanel } from "./HypothesisPanel";
import { HypothesisModal } from "./HypothesisModal";
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
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);
    const modalHypothesisId = useSelection((s) => s.modalHypothesisId);

    const workingSet = useQuery({
        queryKey: ["workingSet", mode],
        queryFn: () => loadWorkingSetAction(mode),
    });
    const snapshot = useQuery({
        queryKey: ["snapshot"],
        queryFn: () => loadSnapshotAction(),
    });

    // 워킹셋이 로드되면 첫 케이스를 자동 선택한다. 현재 선택이 워킹셋에
    // 없을 때(모드 전환 등)도 첫 케이스로 되돌린다.
    useEffect(() => {
        const list = workingSet.data;
        if (!list || list.length === 0) return;
        if (selectedCaseId && list.some((c) => c.caseId === selectedCaseId)) return;
        selectCase(list[0].caseId);
    }, [workingSet.data, selectedCaseId, selectCase]);

    const selectedCase = workingSet.data?.find((c) => c.caseId === selectedCaseId) ?? null;
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
            const list = workingSet.data;
            if (!list || list.length === 0) return;
            const idx = list.findIndex((c) => c.caseId === selectedCaseId);
            const cur = idx < 0 ? 0 : idx;
            const next = key === "a" ? cur - 1 : cur + 1;
            if (next < 0 || next >= list.length) return;
            selectCase(list[next].caseId);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [workingSet.data, selectedCaseId, selectCase, modalHypothesisId]);

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
            <div className={styles.rail}>
                <CaseRail
                    cases={workingSet.data ?? []}
                    loading={workingSet.isLoading}
                    linkedCountByCase={linkedCountByCase}
                />
            </div>
            <div className={styles.bottom}>
                <div className={styles.panel}>
                    <HypothesisPanel snapshot={snapshot.data ?? null} selectedCase={selectedCase} />
                </div>
                <div className={styles.graph}>
                    {selectedCase && (
                        <div className={styles.caseBadge}>
                            <span className={styles.caseBadgeName}>
                                {selectedCase.stockName ?? selectedCase.stockCode}
                            </span>
                            {selectedCase.stockName && (
                                <span className={styles.caseBadgeCode}>{selectedCase.stockCode}</span>
                            )}
                            <span className={styles.caseBadgeDate}>{selectedCase.tradeDate}</span>
                        </div>
                    )}
                    <HypothesisGraph
                        snapshot={snapshot.data ?? null}
                        highlightHypothesisIds={linkedToSelectedCase}
                        caseSelected={!!selectedCase}
                        onToggleCaseLink={handleToggleCaseLink}
                    />
                </div>
            </div>
            <WorkbenchSettingsModal />
            <HypothesisModal />
        </div>
    );
}
