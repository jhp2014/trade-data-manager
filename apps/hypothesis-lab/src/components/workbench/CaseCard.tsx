"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findOutcome } from "@/domain/outcome";
import { useOutcomeTypes } from "@/stores/outcomeTypes";
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

const POPOVER_W = 150;

export function CaseCard({
    c,
    selected,
    linkedCount,
    onSelect,
    onSetOutcome,
}: {
    c: WorkingSetCase;
    selected: boolean;
    linkedCount: number;
    onSelect: () => void;
    onSetOutcome: (outcome: string | null) => void;
}) {
    const options = useOutcomeTypes((s) => s.options);
    const opt = findOutcome(options, c.outcome);

    const [copied, setCopied] = useState(false);
    const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    async function copy(e: React.MouseEvent) {
        e.stopPropagation();
        await navigator.clipboard.writeText(c.caseId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    }

    function openEditor() {
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        const left = Math.min(
            Math.max(8, rect.right - POPOVER_W),
            window.innerWidth - POPOVER_W - 8,
        );
        setAnchor({ top: rect.bottom + 4, left });
    }

    function pick(e: React.MouseEvent, value: string | null) {
        e.stopPropagation();
        onSetOutcome(value);
        setAnchor(null);
    }

    // 팝오버 바깥 클릭 / Esc / 스크롤·리사이즈 시 닫는다(fixed 라 따라가지 않으므로).
    useEffect(() => {
        if (!anchor) return;
        function onDown(ev: MouseEvent) {
            if (!popRef.current?.contains(ev.target as Node)) setAnchor(null);
        }
        function onKey(ev: KeyboardEvent) {
            if (ev.key === "Escape") setAnchor(null);
        }
        function onScroll() {
            setAnchor(null);
        }
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onScroll);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onScroll);
        };
    }, [anchor]);

    return (
        <div
            ref={cardRef}
            className={cx(styles.card, selected && styles.selected)}
            data-case-id={c.caseId}
            onClick={onSelect}
            onDoubleClick={(e) => {
                e.stopPropagation();
                if (anchor) setAnchor(null);
                else openEditor();
            }}
        >
            <div className={styles.line1}>
                <div className={styles.nameWrap}>
                    <span className={styles.name} title={c.stockCode || c.caseId}>
                        {c.stockName ?? c.stockCode}
                    </span>
                    <button
                        className={styles.copy}
                        onClick={copy}
                        title={copied ? "복사됨" : c.caseId}
                        aria-label="caseId 복사"
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
                {opt ? (
                    <span className={styles.outcome} data-color={opt.color} title={`결과: ${opt.label}`}>
                        {opt.label}
                    </span>
                ) : (
                    <span
                        className={cx(styles.outcome, styles.outcomeEmpty)}
                        title="더블클릭으로 결과 설정"
                    >
                        —
                    </span>
                )}
            </div>
            <div className={styles.line2}>
                <span className={styles.meta}>
                    {c.tradeDate}
                    {c.tradeTime ? ` · ${c.tradeTime}` : ""}
                </span>
                <span
                    className={cx(styles.count, linkedCount === 0 && styles.countZero)}
                    title="연결된 가설 수"
                >
                    {linkedCount}
                </span>
            </div>

            {anchor &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={popRef}
                        className={styles.editor}
                        style={{ top: anchor.top, left: anchor.left, width: POPOVER_W }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.editorTitle}>결과 선택</div>
                        <div className={styles.editorOpts}>
                            {options.map((o) => (
                                <button
                                    key={o.value}
                                    className={cx(styles.opt, c.outcome === o.value && styles.optActive)}
                                    data-color={o.color}
                                    onClick={(e) => pick(e, o.value)}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                        {c.outcome != null && (
                            <button className={styles.clear} onClick={(e) => pick(e, null)}>
                                해제
                            </button>
                        )}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
