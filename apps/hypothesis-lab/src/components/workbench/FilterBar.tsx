"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import { parseHypExpr, searchCasesByExpr, unknownRefs } from "@/services/hypExpr";
import { useWorkbench } from "@/stores/workbench";
import styles from "./FilterBar.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/**
 * 불리언 모드 식 입력 바. Nav 의 모드 토글 바로 옆에 인라인으로 놓인다.
 * 식 파싱·평가·피드백(결과수·에러·미지코드)을 자체적으로 계산한다
 * (snapshot 은 react-query 캐시를 공유하므로 추가 요청 없음).
 */
export function FilterBar() {
    const filterMode = useWorkbench((s) => s.filterMode);
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);

    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });

    const parsed = useMemo(
        () => (expr.trim() !== "" ? parseHypExpr(expr) : null),
        [expr],
    );
    const resultCount = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return null;
        return searchCasesByExpr(snap, parsed.expr).length;
    }, [snapshot.data, parsed]);
    const unknownCodes = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return [];
        return unknownRefs(parsed.expr, snap.hypotheses.map((h) => h.code));
    }, [snapshot.data, parsed]);

    if (filterMode !== "boolean") return null;

    const error = parsed && !parsed.ok ? parsed.error : null;

    return (
        <div className={styles.bar}>
            <input
                className={cx(styles.expr, error && expr.trim() && styles.exprError)}
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                placeholder="가설 코드를 &(AND) |(OR) !(NOT) 로 조합"
                spellCheck={false}
                autoComplete="off"
            />
            {expr.trim() !== "" && (
                <div className={styles.feedback}>
                    {error ? (
                        <span className={styles.err}>{error}</span>
                    ) : (
                        <>
                            <span className={styles.count}>{resultCount ?? 0}건</span>
                            {unknownCodes.length > 0 && (
                                <span className={styles.unknown}>
                                    알 수 없는 코드: {unknownCodes.join(", ")}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
