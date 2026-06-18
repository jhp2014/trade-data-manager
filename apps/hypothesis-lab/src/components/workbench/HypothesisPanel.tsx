"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    createHypothesisAction,
    linkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import type { HypothesisSnapshot } from "@/domain/types";
import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";

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
        mutationFn: linkCaseAction,
        onSuccess: refresh,
    });
    const createMut = useMutation({
        mutationFn: createHypothesisAction,
        onSuccess: refresh,
    });

    if (!snapshot) return <p className="muted pad">불러오는 중…</p>;

    const linkedHere = selectedCase
        ? snapshot.hypothesisCases.filter((hc) => hc.caseId === selectedCase.caseId)
        : [];
    const linkedIds = new Set(linkedHere.map((hc) => hc.hypothesisId));
    const hypById = new Map(snapshot.hypotheses.map((h) => [h.id, h]));

    function link(hypothesisId: string) {
        if (!selectedCase) return;
        linkMut.mutate({ hypothesisId, case: toCaseInput(selectedCase) });
    }
    function addHypothesis() {
        const trimmed = text.trim();
        if (!trimmed) return;
        createMut.mutate(
            { text: trimmed, case: selectedCase ? toCaseInput(selectedCase) : undefined },
            { onSuccess: () => setText("") },
        );
    }

    return (
        <div className="hyp-panel">
            <header className="col-head">
                <h2>가설</h2>
                <span className="muted sm">
                    {selectedCase ? `선택: ${selectedCase.stockName ?? selectedCase.stockCode}` : "케이스 미선택"}
                </span>
            </header>

            <div className="hyp-section">
                <h3>이 케이스의 가설</h3>
                {!selectedCase && <p className="muted sm">왼쪽에서 케이스를 선택하세요.</p>}
                {selectedCase && linkedHere.length === 0 && (
                    <p className="muted sm">아직 연결된 가설이 없습니다.</p>
                )}
                <ul className="linked">
                    {linkedHere.map((hc) => {
                        const h = hypById.get(hc.hypothesisId);
                        return (
                            <li key={hc.id}>
                                <code className="hcode">{h?.code}</code>
                                <span className="htext">{h?.text}</span>
                                {hc.outcome && <span className={`outcome o-${hc.outcome}`}>{hc.outcome}</span>}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="hyp-section grow">
                <h3>전체 가설</h3>
                <ul className="all-hyps">
                    {snapshot.hypotheses.map((h) => {
                        const already = linkedIds.has(h.id);
                        return (
                            <li
                                key={h.id}
                                className={`hyp-row${h.id === selectedHypothesisId ? " is-selected" : ""}`}
                                onClick={() => selectHypothesis(h.id)}
                            >
                                <code className="hcode">{h.code}</code>
                                <span className={`status s-${h.status}`}>{h.status}</span>
                                <span className="htext">{h.text}</span>
                                {selectedCase &&
                                    (already ? (
                                        <span className="linked-check" title="이미 연결됨">
                                            ✓
                                        </span>
                                    ) : (
                                        <button
                                            className="link-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                link(h.id);
                                            }}
                                            disabled={linkMut.isPending}
                                        >
                                            연결
                                        </button>
                                    ))}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="hyp-new">
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
