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

function statusClass(status: string) {
    if (status === "active") return styles.activeStatus;
    if (status === "draft") return styles.draftStatus;
    return "";
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

    // mutationFn 은 변수 1개만 넘기도록 화살표로 감싼다. 서버 액션을 직접 넘기면
    // React Query 가 추가 인자를 전달해 "Only plain objects..." 직렬화 에러가 난다.
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
            ? snapshot.hypothesisCases.filter((hc) => hc.caseId === selectedCase.caseId).map((hc) => hc.hypothesisId)
            : [],
    );

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
            <header className={styles.head}>
                <h2>가설</h2>
                <span className={cx(styles.muted, styles.sm)}>
                    {selectedCase
                        ? `${selectedCase.stockName ?? selectedCase.stockCode} · ${linkedIds.size}개 연결`
                        : "케이스 미선택"}
                </span>
            </header>

            <ul className={styles.list}>
                {ordered.map((h) => {
                    const linked = linkedIds.has(h.id);
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
                            <code className={styles.code}>{h.code}</code>
                            <span className={cx(styles.status, statusClass(h.status))}>{h.status}</span>
                            <span className={styles.text}>{h.text}</span>
                        </li>
                    );
                })}
            </ul>

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
        </div>
    );
}
