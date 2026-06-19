"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    createHypothesisAction,
    linkCaseAction,
    unlinkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import { deleteHypothesisAction } from "@/actions/edit";
import type { HypothesisSnapshot } from "@/domain/types";
import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";
import styles from "./HypothesisPanel.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function TrashIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
            <path d="M10 11v6M14 11v6" />
        </svg>
    );
}

function toCaseInput(c: WorkingSetCase): CaseSnapshotInput {
    return {
        caseId: c.caseId,
        stockCode: c.stockCode,
        stockName: c.stockName,
        tradeDate: c.tradeDate,
        tradeTime: c.tradeTime,
    };
}

export function HypothesisPanel({
    snapshot,
    selectedCase,
}: {
    snapshot: HypothesisSnapshot | null;
    selectedCase: WorkingSetCase | null;
}) {
    const queryClient = useQueryClient();
    const selectedHypothesisId = useSelection((s) => s.selectedHypothesisId);
    const selectHypothesis = useSelection((s) => s.selectHypothesis);
    const openHypothesisModal = useSelection((s) => s.openHypothesisModal);
    const [text, setText] = useState("");

    function refresh() {
        queryClient.invalidateQueries({ queryKey: ["snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["workingSet"] });
    }

    const linkMut = useMutation({
        mutationFn: (v: { hypothesisId: string; case: CaseSnapshotInput }) => linkCaseAction(v),
        onSuccess: refresh,
    });
    const unlinkMut = useMutation({
        mutationFn: (v: { hypothesisId: string; caseId: string }) => unlinkCaseAction(v),
        onSuccess: refresh,
    });
    const createMut = useMutation({
        mutationFn: (v: { text: string; case?: CaseSnapshotInput }) => createHypothesisAction(v),
        onSuccess: () => {
            refresh();
            setText("");
        },
    });
    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteHypothesisAction(id),
        onSuccess: refresh,
    });

    if (!snapshot) return <p className={cx(styles.muted, styles.pad)}>불러오는 중…</p>;

    const linkedIds = new Set(
        selectedCase
            ? snapshot.hypothesisCases
                  .filter((hc) => hc.caseId === selectedCase.caseId)
                  .map((hc) => hc.hypothesisId)
            : [],
    );

    const tagName = new Map(snapshot.tags.map((t) => [t.id, t.name]));
    const tagsByHyp = new Map<string, string[]>();
    for (const ht of snapshot.hypothesisTags) {
        const arr = tagsByHyp.get(ht.hypothesisId) ?? [];
        arr.push(tagName.get(ht.tagId) ?? "");
        tagsByHyp.set(ht.hypothesisId, arr);
    }
    const caseCount = new Map<string, number>();
    for (const hc of snapshot.hypothesisCases) {
        caseCount.set(hc.hypothesisId, (caseCount.get(hc.hypothesisId) ?? 0) + 1);
    }

    // 현재 케이스에 연결된 가설을 위로 모아 UI 로 구분.
    const ordered = selectedCase
        ? [...snapshot.hypotheses].sort(
              (a, b) => Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id)),
          )
        : snapshot.hypotheses;

    function toggleLink(hypothesisId: string, checked: boolean) {
        if (!selectedCase) return;
        if (checked) linkMut.mutate({ hypothesisId, case: toCaseInput(selectedCase) });
        else unlinkMut.mutate({ hypothesisId, caseId: selectedCase.caseId });
    }
    function addHypothesis() {
        const trimmed = text.trim();
        if (!trimmed) return;
        createMut.mutate({ text: trimmed, case: selectedCase ? toCaseInput(selectedCase) : undefined });
    }

    return (
        <div className={styles.panel}>
            <div className={styles.newHyp}>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHypothesis()}
                    placeholder={selectedCase ? "새 가설 입력 후 Enter (선택 케이스에 연결)" : "새 가설 입력 후 Enter"}
                />
                <button onClick={addHypothesis} disabled={createMut.isPending || !text.trim()}>
                    {selectedCase ? "추가+연결" : "추가"}
                </button>
            </div>

            <ul className={styles.list}>
                {ordered.map((h) => {
                    const linked = linkedIds.has(h.id);
                    const tags = tagsByHyp.get(h.id) ?? [];
                    const cnt = caseCount.get(h.id) ?? 0;
                    return (
                        <li
                            key={h.id}
                            className={cx(
                                styles.row,
                                h.id === selectedHypothesisId && styles.selected,
                                linked && styles.linked,
                            )}
                            onClick={() => selectHypothesis(h.id)}
                            onDoubleClick={() => openHypothesisModal(h.id)}
                        >
                            <div className={styles.left}>
                                <input
                                    type="checkbox"
                                    className={styles.check}
                                    checked={linked}
                                    disabled={!selectedCase || linkMut.isPending || unlinkMut.isPending}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => toggleLink(h.id, e.target.checked)}
                                    title={selectedCase ? "현재 케이스에 연결/해제" : "케이스를 먼저 선택"}
                                />
                                <button
                                    className={styles.del}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`${h.code} 가설을 삭제할까요? 연결·관계도 함께 제거됩니다.`)) {
                                            deleteMut.mutate(h.id);
                                        }
                                    }}
                                    title="가설 삭제"
                                    aria-label="가설 삭제"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                            <div className={styles.main}>
                                <div className={styles.line1}>
                                    <code className={styles.code}>{h.code}</code>
                                    {cnt > 0 && <span className={styles.count}>Case {cnt}</span>}
                                    {tags.length > 0 && (
                                        <div className={styles.tags}>
                                            {tags.map((t, i) => (
                                                <span key={i} className={styles.tag}>
                                                    #{t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className={styles.text}>{h.text}</div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
