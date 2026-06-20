"use client";

import { useQuery } from "@tanstack/react-query";
import { loadCasesAction } from "@/actions/workbench";
import { useWorkbench } from "@/stores/workbench";
import styles from "./HistoryModal.module.css";

/**
 * History 목록 관리 모달(넓게). Ctrl+V 로 쌓인 caseId 들을 enrich 해서 보여주고,
 * 개별 제거 / 전체 비우기를 지원한다. 최대 개수는 설정 모달에서 조정.
 */
export function HistoryModal() {
    const open = useWorkbench((s) => s.historyModalOpen);
    const close = useWorkbench((s) => s.closeHistoryModal);
    const history = useWorkbench((s) => s.history);
    const removeHistory = useWorkbench((s) => s.removeHistory);
    const clearHistory = useWorkbench((s) => s.clearHistory);
    const historyMax = useWorkbench((s) => s.historyMax);

    const cases = useQuery({
        queryKey: ["historyCases", history],
        queryFn: () => loadCasesAction(history),
        enabled: open && history.length > 0,
    });

    if (!open) return null;

    return (
        <div className={styles.overlay} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>
                        History 목록 <span className={styles.dim}>({history.length}/{historyMax})</span>
                    </h2>
                    <div className={styles.headActions}>
                        <button
                            className={styles.clearAll}
                            onClick={clearHistory}
                            disabled={history.length === 0}
                        >
                            전체 비우기
                        </button>
                        <button className={styles.x} onClick={close} aria-label="닫기">
                            ×
                        </button>
                    </div>
                </header>

                <div className={styles.body}>
                    {history.length === 0 ? (
                        <p className={styles.muted}>
                            Ctrl+V 로 caseId 를 붙여넣으면 여기에 쌓입니다.
                        </p>
                    ) : cases.isLoading ? (
                        <p className={styles.muted}>불러오는 중…</p>
                    ) : (
                        <ul className={styles.list}>
                            {(cases.data ?? []).map((c) => (
                                <li key={c.caseId} className={styles.row}>
                                    <div className={styles.info}>
                                        <span className={styles.name}>
                                            {c.stockName ?? c.stockCode}
                                            {!c.existsInReview && (
                                                <span className={styles.orphan} title="review_point 에 없음">
                                                    고아
                                                </span>
                                            )}
                                        </span>
                                        <span className={styles.meta}>
                                            {c.stockCode} · {c.tradeDate}
                                            {c.tradeTime ? ` ${c.tradeTime}` : ""}
                                        </span>
                                        <span className={styles.caseId}>{c.caseId}</span>
                                    </div>
                                    <button
                                        className={styles.remove}
                                        onClick={() => removeHistory(c.caseId)}
                                        title="History 에서 제거"
                                        aria-label="History 에서 제거"
                                    >
                                        ×
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
