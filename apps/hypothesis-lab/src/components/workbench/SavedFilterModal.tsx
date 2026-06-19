"use client";

import { useEffect, useMemo, useState } from "react";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { useWorkbench } from "@/stores/workbench";
import styles from "./SavedFilterModal.module.css";

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

    // 모달이 열릴 때마다 이름 입력 초기화.
    useEffect(() => {
        if (kind === "save") setName("");
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
    const doLoad = (loadExpr: string) => {
        setFilterMode("boolean");
        setExpr(loadExpr);
        close();
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
                    <ul className={styles.list}>
                        {filters.map((f) => (
                            <li key={f.name} className={styles.row}>
                                <button
                                    className={styles.rowMain}
                                    onClick={() => doLoad(f.expr)}
                                    title="이 필터 불러오기"
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
                )}
            </div>
        </div>
    );
}
