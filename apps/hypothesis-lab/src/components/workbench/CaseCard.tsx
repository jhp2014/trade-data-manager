"use client";

import { useState } from "react";
import type { WorkingSetCase } from "@/services/workingSet";
import styles from "./CaseCard.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function CopyIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
    );
}
function CheckIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12l5 5L20 6" />
        </svg>
    );
}

export function CaseCard({
    c,
    selected,
    onSelect,
}: {
    c: WorkingSetCase;
    selected: boolean;
    onSelect: () => void;
}) {
    const [copied, setCopied] = useState(false);

    async function copy(e: React.MouseEvent) {
        e.stopPropagation();
        await navigator.clipboard.writeText(c.caseId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    }

    return (
        <div className={cx(styles.card, selected && styles.selected)} onClick={onSelect}>
            <div className={styles.body}>
                <span className={styles.name}>{c.stockName ?? c.stockCode}</span>
                <span className={styles.meta}>
                    {c.tradeDate}
                    {c.tradeTime ? ` ${c.tradeTime}` : ""}
                </span>
            </div>
            <button
                className={styles.copy}
                onClick={copy}
                title={copied ? "복사됨" : c.caseId}
                aria-label="caseId 복사"
            >
                {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
        </div>
    );
}
