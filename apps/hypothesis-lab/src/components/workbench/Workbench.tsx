"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction, loadWorkingSetAction } from "@/actions/workbench";
import type { WorkingSetMode } from "@/repositories/workingSetSources";
import { useSelection } from "@/stores/selection";
import { HypothesisGraph } from "@/components/graph/HypothesisGraph";
import { CaseList } from "./CaseList";
import { HypothesisPanel } from "./HypothesisPanel";
import styles from "./Workbench.module.css";

export function Workbench() {
    const [mode, setMode] = useState<WorkingSetMode>({ kind: "review-recent" });
    const selectedCaseId = useSelection((s) => s.selectedCaseId);

    const workingSet = useQuery({
        queryKey: ["workingSet", mode],
        queryFn: () => loadWorkingSetAction(mode),
    });
    const snapshot = useQuery({
        queryKey: ["snapshot"],
        queryFn: () => loadSnapshotAction(),
    });

    const selectedCase =
        workingSet.data?.find((c) => c.caseId === selectedCaseId) ?? null;

    const linkedToSelectedCase = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !selectedCaseId) return [];
        return snap.hypothesisCases
            .filter((hc) => hc.caseId === selectedCaseId)
            .map((hc) => hc.hypothesisId);
    }, [snapshot.data, selectedCaseId]);

    return (
        <div className={styles.grid}>
            <section className={styles.col}>
                <CaseList
                    mode={mode}
                    onModeChange={setMode}
                    cases={workingSet.data ?? []}
                    loading={workingSet.isLoading}
                />
            </section>
            <section className={styles.col}>
                <HypothesisPanel snapshot={snapshot.data ?? null} selectedCase={selectedCase} />
            </section>
            <section className={`${styles.col} ${styles.graphCol}`}>
                <HypothesisGraph
                    snapshot={snapshot.data ?? null}
                    highlightHypothesisIds={linkedToSelectedCase}
                />
            </section>
        </div>
    );
}
