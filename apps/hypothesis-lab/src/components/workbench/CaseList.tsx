"use client";

import { useState } from "react";
import type { WorkingSetMode } from "@/repositories/workingSetSources";
import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";
import styles from "./CaseList.module.css";

const MODES: { label: string; mode: WorkingSetMode }[] = [
    { label: "최근", mode: { kind: "review-recent" } },
    { label: "시트", mode: { kind: "sheet" } },
    { label: "연결된 것만", mode: { kind: "snapshot" } },
];

export function CaseList({
    mode,
    onModeChange,
    cases,
    loading,
}: {
    mode: WorkingSetMode;
    onModeChange: (mode: WorkingSetMode) => void;
    cases: WorkingSetCase[];
    loading: boolean;
}) {
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);
    const [copied, setCopied] = useState<string | null>(null);

    async function copyCaseId(caseId: string, e: React.MouseEvent) {
        e.stopPropagation();
        await navigator.clipboard.writeText(caseId);
        setCopied(caseId);
        setTimeout(() => setCopied((c) => (c === caseId ? null : c)), 1200);
    }

    return (
        <div>
            <header className={styles.head}>
                <h2>케이스</h2>
                <div className={styles.seg}>
                    {MODES.map((m) => (
                        <button
                            key={m.label}
                            className={mode.kind === m.mode.kind ? styles.active : ""}
                            onClick={() => onModeChange(m.mode)}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </header>

            {loading && <p className={`${styles.muted} ${styles.pad}`}>불러오는 중…</p>}
            {!loading && cases.length === 0 && (
                <p className={`${styles.muted} ${styles.pad}`}>케이스가 없습니다.</p>
            )}

            <ul className={styles.rows}>
                {cases.map((c) => {
                    const linked = c.linkedHypothesisIds.length > 0;
                    return (
                        <li
                            key={c.caseId}
                            className={`${styles.row}${c.caseId === selectedCaseId ? ` ${styles.selected}` : ""}${
                                linked ? ` ${styles.linked}` : ""
                            }`}
                            onClick={() => selectCase(c.caseId)}
                        >
                            <span className={styles.dot} title={linked ? "가설 연결됨" : "미연결"} />
                            <span className={styles.name}>{c.stockName ?? c.stockCode}</span>
                            <button
                                className={styles.id}
                                onClick={(e) => copyCaseId(c.caseId, e)}
                                title="클릭하면 caseId 복사"
                            >
                                {copied === c.caseId ? "복사됨!" : c.caseId}
                            </button>
                            <span className={styles.meta}>
                                {c.tradeDate}
                                {c.tradeTime ? ` ${c.tradeTime}` : ""}
                            </span>
                            {linked && <span className={styles.count}>{c.linkedHypothesisIds.length}</span>}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
