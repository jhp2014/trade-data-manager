"use client";

import { useEffect, useMemo, useState } from "react";
import { useSavedLayouts } from "@/hooks/useSavedLayouts";
import type { NodePositions } from "@/lib/graphPositions";
import styles from "./SavedLayoutModal.module.css";

/**
 * 그래프 레이아웃 저장/불러오기 모달. `kind`("save" | "load")에 따라 두 화면을
 * 렌더한다. 목록은 localStorage(useSavedLayouts). 저장 필터 모달과 같은 모양.
 */
export function SavedLayoutModal({
    kind,
    currentPositions,
    onApply,
    onClose,
}: {
    kind: "save" | "load" | null;
    currentPositions: NodePositions;
    onApply: (positions: NodePositions) => void;
    onClose: () => void;
}) {
    const { layouts, save, remove } = useSavedLayouts();
    const [name, setName] = useState("");

    // 모달이 열릴 때마다 입력 초기화.
    useEffect(() => {
        if (kind === "save") setName("");
    }, [kind]);

    useEffect(() => {
        if (!kind) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [kind, onClose]);

    const trimmed = name.trim();
    const overwrites = useMemo(
        () => layouts.some((l) => l.name === trimmed),
        [layouts, trimmed],
    );
    const nodeCount = Object.keys(currentPositions).length;

    if (!kind) return null;

    const doSave = () => {
        if (!trimmed) return;
        save(trimmed, currentPositions);
        onClose();
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>{kind === "save" ? "레이아웃 저장" : "레이아웃 불러오기"}</h2>
                    <button className={styles.x} onClick={onClose} aria-label="닫기">
                        ×
                    </button>
                </header>

                {kind === "save" ? (
                    <div className={styles.body}>
                        <span className={styles.label}>{nodeCount}개 노드 위치</span>
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
                            <button className={styles.ghost} onClick={onClose}>
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
                        {layouts.map((l) => (
                            <li key={l.name} className={styles.row}>
                                <button
                                    className={styles.rowMain}
                                    onClick={() => {
                                        onApply(l.positions);
                                        onClose();
                                    }}
                                    title="이 레이아웃으로 위치 복원"
                                >
                                    <span className={styles.rowName}>{l.name}</span>
                                    <span className={styles.rowMeta}>
                                        {Object.keys(l.positions).length}개 노드
                                    </span>
                                </button>
                                <button
                                    className={styles.del}
                                    onClick={() => remove(l.name)}
                                    aria-label="삭제"
                                    title="삭제"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                        {layouts.length === 0 && (
                            <li className={styles.empty}>저장된 레이아웃이 없습니다</li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}
