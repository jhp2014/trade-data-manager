"use client";

import { useState } from "react";
import { findOutcome } from "@/domain/outcome";
import { useOutcomeTypes } from "@/stores/outcomeTypes";
import type { WorkingSetCase } from "@/services/workingSet";
import styles from "./SelectedCaseBadge.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function CopyIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12l5 5L20 6" />
        </svg>
    );
}

/**
 * 그래프 좌상단 오버레이 — 현재 선택된 케이스 요약(읽기 전용).
 * 그래프 강조(highlight)가 어떤 케이스 기준인지 보여준다. outcome 편집은 카드에서.
 */
export function SelectedCaseBadge({
    c,
    linkedCount,
}: {
    c: WorkingSetCase;
    linkedCount: number;
}) {
    const options = useOutcomeTypes((s) => s.options);
    const opt = findOutcome(options, c.outcome);
    const [copied, setCopied] = useState(false);

    async function copy() {
        await navigator.clipboard.writeText(c.caseId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    }

    return (
        <div className={styles.badge}>
            {opt ? (
                <span className={styles.outcome} data-color={opt.color}>
                    {opt.label}
                </span>
            ) : (
                <span className={cx(styles.outcome, styles.outcomeEmpty)}>—</span>
            )}
            <span className={styles.run}>
                <span className={styles.name} title={c.stockCode || c.caseId}>
                    {c.stockName ?? c.stockCode}
                </span>
                <span className={styles.meta}>
                    {c.tradeDate}
                    {c.tradeTime ? ` · ${c.tradeTime}` : ""}
                </span>
                <span className={styles.linked}>가설 {linkedCount}</span>
            </span>
            <button className={styles.copy} onClick={copy} title={c.caseId} aria-label="caseId 복사">
                {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
        </div>
    );
}
