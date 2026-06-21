"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import { parseHypExpr, searchCasesByExpr, unknownRefs } from "@/services/hypExpr";
import { aggregateOutcomes } from "@/services/outcomeAgg";
import { useOutcomeTypes } from "@/stores/outcomeTypes";
import { useWorkbench } from "@/stores/workbench";
import styles from "./GraphFilterStatus.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/**
 * 그래프 좌상단 상태 — 현재 불리언 식을 읽기 전용으로 보여준다(입력창 없이 확인용).
 * 식 + 결과 건수 + outcome 집계. 식이 비었으면 아무것도 렌더하지 않는다.
 */
export function GraphFilterStatus() {
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);
    const outcomeOptions = useOutcomeTypes((s) => s.options);
    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });

    const parsed = useMemo(
        () => (expr.trim() !== "" ? parseHypExpr(expr) : null),
        [expr],
    );
    const results = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return null;
        return searchCasesByExpr(snap, parsed.expr);
    }, [snapshot.data, parsed]);
    const agg = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !results || results.length === 0) return null;
        return aggregateOutcomes({
            caseIds: results.map((r) => r.caseId),
            cases: snap.cases,
            options: outcomeOptions,
        });
    }, [snapshot.data, results, outcomeOptions]);
    const unknownCodes = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return [];
        return unknownRefs(parsed.expr, snap.hypotheses.map((h) => h.code));
    }, [snapshot.data, parsed]);

    if (parsed === null) return null;
    const error = !parsed.ok ? parsed.error : null;

    return (
        <div className={styles.status}>
            <span className={cx(styles.exprPill, error && styles.exprError)} title={error ?? undefined}>
                <span className={styles.exprText}>{expr}</span>
                {error ? (
                    <span className={styles.badge}>오류</span>
                ) : (
                    <span className={cx(styles.badge, unknownCodes.length > 0 && styles.badgeWarn)}>
                        {results?.length ?? 0}건
                    </span>
                )}
            </span>
            {agg && agg.items.length > 0 && (
                <div className={styles.agg} title={`결과 ${agg.total}건의 outcome 집계`}>
                    {agg.items.map((it) => (
                        <span key={it.key} className={styles.aggPill} data-color={it.color ?? undefined}>
                            <span className={styles.aggLabel}>{it.label}</span>
                            <span className={styles.aggNum}>{it.count}</span>
                        </span>
                    ))}
                </div>
            )}
            {/* 식 비우기 — 항상 가장 우측 끝. */}
            <button
                type="button"
                className={styles.clear}
                onClick={() => setExpr("")}
                title="필터 식 비우기"
                aria-label="필터 식 비우기"
            >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </div>
    );
}
