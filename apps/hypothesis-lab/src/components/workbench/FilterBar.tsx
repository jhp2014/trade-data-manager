"use client";

import { useWorkbench } from "@/stores/workbench";
import styles from "./FilterBar.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/**
 * 레일 상단 바: 작업셋 ↔ 불리언 필터 모드 토글 + 불리언 모드일 때 식 입력.
 * 식 평가는 Workbench 가 담당하고, 여기에는 그 피드백(결과수·에러·미지코드)만 내려온다.
 */
export function FilterBar({
    resultCount,
    error,
    unknownCodes,
}: {
    resultCount: number | null;
    error: string | null;
    unknownCodes: string[];
}) {
    const filterMode = useWorkbench((s) => s.filterMode);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);

    return (
        <div className={styles.bar}>
            <div className={styles.toggle} role="tablist" aria-label="레일 모드">
                <button
                    role="tab"
                    aria-selected={filterMode === "workingset"}
                    className={cx(styles.tab, filterMode === "workingset" && styles.tabActive)}
                    onClick={() => setFilterMode("workingset")}
                >
                    작업셋
                </button>
                <button
                    role="tab"
                    aria-selected={filterMode === "boolean"}
                    className={cx(styles.tab, filterMode === "boolean" && styles.tabActive)}
                    onClick={() => setFilterMode("boolean")}
                >
                    불리언 필터
                </button>
            </div>

            {filterMode === "boolean" && (
                <div className={styles.exprWrap}>
                    <input
                        className={cx(styles.expr, error && expr.trim() && styles.exprError)}
                        value={expr}
                        onChange={(e) => setExpr(e.target.value)}
                        placeholder="예: (H0001 & H0002) | !H0003"
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <div className={styles.feedback}>
                        {expr.trim() === "" ? (
                            <span className={styles.hint}>가설 코드를 &amp;(AND) |(OR) !(NOT) 로 조합</span>
                        ) : error ? (
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
                </div>
            )}
        </div>
    );
}
