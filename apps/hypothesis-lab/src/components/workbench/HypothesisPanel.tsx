"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    createHypothesisAction,
    linkCaseAction,
    unlinkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import type { HypothesisSnapshot } from "@/domain/types";
import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";
import styles from "./HypothesisPanel.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
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
                        >
                            <input
                                type="checkbox"
                                className={styles.check}
                                checked={linked}
                                disabled={!selectedCase || linkMut.isPending || unlinkMut.isPending}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => toggleLink(h.id, e.target.checked)}
                                title={selectedCase ? "현재 케이스에 연결/해제" : "케이스를 먼저 선택"}
                            />
                            <div className={styles.main}>
                                <div className={styles.line1}>
                                    <code className={styles.code}>{h.code}</code>
                                    {cnt > 0 && <span className={styles.count}>연결 {cnt}</span>}
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
