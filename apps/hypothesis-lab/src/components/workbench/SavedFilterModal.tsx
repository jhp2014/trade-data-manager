"use client";

import { useEffect, useMemo, useState } from "react";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { useWorkbench } from "@/stores/workbench";
import styles from "./SavedFilterModal.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/**
 * 불리언 필터 저장/불러오기 모달. 한 컴포넌트가 스토어의 `savedFilterModal`
 * ("save" | "load") 에 따라 두 화면을 렌더한다. 목록은 localStorage(useSavedFilters).
 */
export function SavedFilterModal() {
    const kind = useWorkbench((s) => s.savedFilterModal);
    const close = useWorkbench((s) => s.closeSavedFilter);
    const expr = useWorkbench((s) => s.expr);
    const setExpr = useWorkbench((s) => s.setExpr);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const { filters, save, remove } = useSavedFilters();

    const [name, setName] = useState("");
    // 불러오기 방식: replace=현재 식 교체, append=현재 식 뒤에 부품처럼 이어붙임.
    const [loadMode, setLoadMode] = useState<"replace" | "append">("replace");
    // append 시 연결 연산자(none=연산자 없이 값만).
    const [connector, setConnector] = useState<"none" | "and" | "or">("and");

    // 모달이 열릴 때마다 입력·토글 초기화.
    useEffect(() => {
        if (kind === "save") setName("");
        if (kind === "load") {
            setLoadMode("replace");
            setConnector("and");
        }
    }, [kind]);

    useEffect(() => {
        if (!kind) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") close();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [kind, close]);

    const trimmed = name.trim();
    const overwrites = useMemo(
        () => filters.some((f) => f.name === trimmed),
        [filters, trimmed],
    );

    if (!kind) return null;

    const doSave = () => {
        if (!trimmed) return;
        save(trimmed, expr);
        close();
    };
    const applyFilter = (filterExpr: string) => {
        setFilterMode("boolean");
        if (loadMode === "replace") {
            setExpr(filterExpr);
            close();
            return;
        }
        // append: 항상 괄호로 감싼 "부품"으로 이어붙인다. 현재 식이 비어 있으면
        // 연산자 없이 부품만, 아니면 선택한 연산자(없음이면 공백)로 연결한다.
        const base = expr.trim();
        const part = `(${filterExpr})`;
        const op = connector === "and" ? "&" : connector === "or" ? "|" : "";
        const next = base === "" ? part : op ? `${base} ${op} ${part}` : `${base} ${part}`;
        setExpr(next);
        // 추가 모드는 여러 부품을 연속으로 조합하도록 모달을 열어둔다.
    };

    return (
        <div className={styles.overlay} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>{kind === "save" ? "필터 저장" : "필터 불러오기"}</h2>
                    <button className={styles.x} onClick={close} aria-label="닫기">
                        ×
                    </button>
                </header>

                {kind === "save" ? (
                    <div className={styles.body}>
                        <div className={styles.previewWrap}>
                            <span className={styles.label}>저장할 식</span>
                            <code className={styles.preview}>{expr}</code>
                        </div>
                        <input
                            className={styles.input}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") doSave();
                            }}
                            placeholder="이름 입력 후 Enter"
                            autoFocus
                            spellCheck={false}
                        />
                        {overwrites && (
                            <span className={styles.hint}>
                                기존 “{trimmed}” 을(를) 덮어씁니다
                            </span>
                        )}
                        <div className={styles.footer}>
                            <button className={styles.ghost} onClick={close}>
                                취소
                            </button>
                            <button
                                className={styles.primary}
                                onClick={doSave}
                                disabled={!trimmed}
                            >
                                저장
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={styles.toolbar}>
                            <div className={styles.seg} role="group" aria-label="불러오기 방식">
                                <button
                                    className={cx(styles.segBtn, loadMode === "replace" && styles.segOn)}
                                    onClick={() => setLoadMode("replace")}
                                >
                                    교체
                                </button>
                                <button
                                    className={cx(styles.segBtn, loadMode === "append" && styles.segOn)}
                                    onClick={() => setLoadMode("append")}
                                >
                                    추가
                                </button>
                            </div>
                            {loadMode === "append" && (
                                <div className={styles.seg} role="group" aria-label="연결 연산자">
                                    <button
                                        className={cx(styles.segBtn, connector === "none" && styles.segOn)}
                                        onClick={() => setConnector("none")}
                                        title="연산자 없이 값만"
                                    >
                                        없음
                                    </button>
                                    <button
                                        className={cx(styles.segBtn, connector === "and" && styles.segOn)}
                                        onClick={() => setConnector("and")}
                                        title="AND 로 연결"
                                    >
                                        &
                                    </button>
                                    <button
                                        className={cx(styles.segBtn, connector === "or" && styles.segOn)}
                                        onClick={() => setConnector("or")}
                                        title="OR 로 연결"
                                    >
                                        |
                                    </button>
                                </div>
                            )}
                        </div>
                        <ul className={styles.list}>
                            {filters.map((f) => (
                            <li key={f.name} className={styles.row}>
                                <button
                                    className={styles.rowMain}
                                    onClick={() => applyFilter(f.expr)}
                                    title={loadMode === "append" ? "현재 식에 부품으로 추가" : "이 필터로 교체"}
                                >
                                    <span className={styles.rowName}>{f.name}</span>
                                    <code className={styles.rowExpr}>{f.expr}</code>
                                </button>
                                <button
                                    className={styles.del}
                                    onClick={() => remove(f.name)}
                                    aria-label="삭제"
                                    title="삭제"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                            {filters.length === 0 && (
                                <li className={styles.empty}>저장된 필터가 없습니다</li>
                            )}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
}
