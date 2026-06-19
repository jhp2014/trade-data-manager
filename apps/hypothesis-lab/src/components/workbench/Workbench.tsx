"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction, loadWorkingSetAction } from "@/actions/workbench";
import { useSelection } from "@/stores/selection";
import { useWorkbench } from "@/stores/workbench";
import { useSelectedCaseCopyShortcut } from "@/hooks/useSelectedCaseCopyShortcut";
import { HypothesisGraph } from "@/components/graph/HypothesisGraph";
import { CaseRail } from "./CaseRail";
import { HypothesisPanel } from "./HypothesisPanel";
import { WorkbenchSettingsModal } from "./WorkbenchSettingsModal";
import styles from "./Workbench.module.css";

export function Workbench() {
    const mode = useWorkbench((s) => s.mode);
    const selectedCaseId = useSelection((s) => s.selectedCaseId);

    const workingSet = useQuery({
        queryKey: ["workingSet", mode],
        queryFn: () => loadWorkingSetAction(mode),
    });
    const snapshot = useQuery({
        queryKey: ["snapshot"],
        queryFn: () => loadSnapshotAction(),
    });

    const selectedCase = workingSet.data?.find((c) => c.caseId === selectedCaseId) ?? null;
    useSelectedCaseCopyShortcut(selectedCase?.caseId ?? null);

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
                <CaseRail cases={workingSet.data ?? []} loading={workingSet.isLoading} />
            </div>
            <div className={styles.bottom}>
                <div className={styles.panel}>
                    <HypothesisPanel snapshot={snapshot.data ?? null} selectedCase={selectedCase} />
                </div>
                <div className={styles.graph}>
                    <HypothesisGraph
                        snapshot={snapshot.data ?? null}
                        highlightHypothesisIds={linkedToSelectedCase}
                    />
                </div>
            </div>
            <WorkbenchSettingsModal />
        </div>
    );
}
