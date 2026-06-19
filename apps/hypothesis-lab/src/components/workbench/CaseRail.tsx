"use client";

import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";
import { CaseCard } from "./CaseCard";
import styles from "./CaseRail.module.css";

export function CaseRail({ cases, loading }: { cases: WorkingSetCase[]; loading: boolean }) {
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);

    const selected = cases.find((c) => c.caseId === selectedCaseId) ?? null;
    const rest = selected ? cases.filter((c) => c.caseId !== selected.caseId) : cases;

    return (
        <div className={styles.rail}>
            {selected && (
                <div className={styles.pinned}>
                    <CaseCard c={selected} selected onSelect={() => selectCase(selected.caseId)} />
                </div>
            )}
            <div className={styles.scroll}>
                {loading && <span className={styles.muted}>불러오는 중…</span>}
                {!loading && cases.length === 0 && (
                    <span className={styles.muted}>케이스가 없습니다</span>
                )}
                {rest.map((c) => (
                    <CaseCard
                        key={c.caseId}
                        c={c}
                        selected={false}
                        onSelect={() => selectCase(c.caseId)}
                    />
                ))}
            </div>
        </div>
    );
}
