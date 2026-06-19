"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import {
    addTagAction,
    removeRelationAction,
    removeTagAction,
    updateHypothesisAction,
    upsertRelationAction,
} from "@/actions/edit";
import { KNOWN_RELATION_TYPES } from "@/domain/validation";
import type { Hypothesis, HypothesisSnapshot } from "@/domain/types";
import { useSelection } from "@/stores/selection";

const STATUSES = ["draft", "active", "archived"];

export function EditView() {
    const queryClient = useQueryClient();
    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });
    const selectedHypothesisId = useSelection((s) => s.selectedHypothesisId);
    const selectHypothesis = useSelection((s) => s.selectHypothesis);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["workingSet"] });
    };
    // mutationFn 은 변수 1개만 넘기도록 화살표로 감싼다(서버 액션 직접 전달 시 직렬화 에러).
    const mUpdate = useMutation({
        mutationFn: (v: { id: string; text?: string; status?: string }) => updateHypothesisAction(v),
        onSuccess: refresh,
    });
    const mAddTag = useMutation({
        mutationFn: (v: { hypothesisId: string; tagName: string }) => addTagAction(v),
        onSuccess: refresh,
    });
    const mRemoveTag = useMutation({
        mutationFn: (v: { hypothesisId: string; tagId: string }) => removeTagAction(v),
        onSuccess: refresh,
    });
    const mAddRel = useMutation({
        mutationFn: (v: {
            fromHypothesisId: string;
            toHypothesisId: string;
            relationType: string;
        }) => upsertRelationAction(v),
        onSuccess: refresh,
    });
    const mRemoveRel = useMutation({
        mutationFn: (v: {
            fromHypothesisId: string;
            toHypothesisId: string;
            relationType: string;
        }) => removeRelationAction(v),
        onSuccess: refresh,
    });

    const data = snapshot.data ?? null;
    if (!data) return <p className="muted pad">불러오는 중…</p>;

    const selected = data.hypotheses.find((h) => h.id === selectedHypothesisId) ?? null;

    return (
        <div className="edit-grid">
            <aside className="wb-col">
                <header className="col-head">
                    <h2>가설</h2>
                </header>
                <ul className="all-hyps pad">
                    {data.hypotheses.map((h) => (
                        <li
                            key={h.id}
                            className={`hyp-row${h.id === selectedHypothesisId ? " is-selected" : ""}`}
                            onClick={() => selectHypothesis(h.id)}
                        >
                            <code className="hcode">{h.code}</code>
                            <span className={`status s-${h.status}`}>{h.status}</span>
                            <span className="htext">{h.text}</span>
                        </li>
                    ))}
                </ul>
            </aside>

            <section className="wb-col">
                {!selected && <p className="muted pad">편집할 가설을 선택하세요.</p>}
                {selected && (
                    <HypothesisEditor
                        key={selected.id}
                        hyp={selected}
                        snapshot={data}
                        onUpdate={(text, status) => mUpdate.mutate({ id: selected.id, text, status })}
                        onAddTag={(tagName) => mAddTag.mutate({ hypothesisId: selected.id, tagName })}
                        onRemoveTag={(tagId) => mRemoveTag.mutate({ hypothesisId: selected.id, tagId })}
                        onAddRelation={(relationType, toHypothesisId) =>
                            mAddRel.mutate({ fromHypothesisId: selected.id, toHypothesisId, relationType })
                        }
                        onRemoveRelation={(toHypothesisId, relationType, reversed) =>
                            mRemoveRel.mutate(
                                reversed
                                    ? { fromHypothesisId: toHypothesisId, toHypothesisId: selected.id, relationType }
                                    : { fromHypothesisId: selected.id, toHypothesisId, relationType },
                            )
                        }
                    />
                )}
            </section>
        </div>
    );
}

function HypothesisEditor({
    hyp,
    snapshot,
    onUpdate,
    onAddTag,
    onRemoveTag,
    onAddRelation,
    onRemoveRelation,
}: {
    hyp: Hypothesis;
    snapshot: HypothesisSnapshot;
    onUpdate: (text: string, status: string) => void;
    onAddTag: (tagName: string) => void;
    onRemoveTag: (tagId: string) => void;
    onAddRelation: (relationType: string, toHypothesisId: string) => void;
    onRemoveRelation: (otherId: string, relationType: string, reversed: boolean) => void;
}) {
    const [text, setText] = useState(hyp.text);
    const [status, setStatus] = useState(hyp.status);
    const [tagName, setTagName] = useState("");
    const [relType, setRelType] = useState(KNOWN_RELATION_TYPES[0] as string);
    const [relTarget, setRelTarget] = useState("");

    const tagNameById = new Map(snapshot.tags.map((t) => [t.id, t.name]));
    const hypById = new Map(snapshot.hypotheses.map((h) => [h.id, h]));
    const myTags = snapshot.hypothesisTags.filter((ht) => ht.hypothesisId === hyp.id);
    const outgoing = snapshot.hypothesisRelations.filter((r) => r.fromHypothesisId === hyp.id);
    const incoming = snapshot.hypothesisRelations.filter((r) => r.toHypothesisId === hyp.id);
    const others = snapshot.hypotheses.filter((h) => h.id !== hyp.id);
    const dirty = text !== hyp.text || status !== hyp.status;

    return (
        <div className="editor">
            <header className="col-head">
                <h2>
                    <code className="hcode">{hyp.code}</code> 편집
                </h2>
            </header>

            <div className="ed-block">
                <label className="ed-label">가설 내용</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
                <div className="ed-row">
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    <button className="primary" disabled={!dirty} onClick={() => onUpdate(text, status)}>
                        저장
                    </button>
                </div>
            </div>

            <div className="ed-block">
                <label className="ed-label">태그</label>
                <div className="chips">
                    {myTags.map((ht) => (
                        <span key={ht.tagId} className="chip is-on">
                            #{tagNameById.get(ht.tagId) ?? ht.tagId}
                            <button className="chip-x" onClick={() => onRemoveTag(ht.tagId)}>
                                ×
                            </button>
                        </span>
                    ))}
                    {myTags.length === 0 && <span className="muted sm">태그 없음</span>}
                </div>
                <div className="ed-row">
                    <input
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && tagName.trim()) {
                                onAddTag(tagName.trim());
                                setTagName("");
                            }
                        }}
                        placeholder="태그 추가 후 Enter"
                        list="tag-options"
                    />
                    <datalist id="tag-options">
                        {snapshot.tags.map((t) => (
                            <option key={t.id} value={t.name} />
                        ))}
                    </datalist>
                </div>
            </div>

            <div className="ed-block grow">
                <label className="ed-label">관계</label>
                <ul className="rel-list">
                    {outgoing.map((r) => (
                        <li key={r.id}>
                            <span className="rel-type">{r.relationType}</span>
                            <span className="rel-arrow">→</span>
                            <code className="hcode">{hypById.get(r.toHypothesisId)?.code}</code>
                            <span className="htext">{hypById.get(r.toHypothesisId)?.text}</span>
                            <button className="chip-x" onClick={() => onRemoveRelation(r.toHypothesisId, r.relationType, false)}>
                                ×
                            </button>
                        </li>
                    ))}
                    {incoming.map((r) => (
                        <li key={r.id} className="rel-in">
                            <code className="hcode">{hypById.get(r.fromHypothesisId)?.code}</code>
                            <span className="htext">{hypById.get(r.fromHypothesisId)?.text}</span>
                            <span className="rel-arrow">→</span>
                            <span className="rel-type">{r.relationType}</span>
                            <button className="chip-x" onClick={() => onRemoveRelation(r.fromHypothesisId, r.relationType, true)}>
                                ×
                            </button>
                        </li>
                    ))}
                    {outgoing.length === 0 && incoming.length === 0 && (
                        <li className="muted sm">관계 없음</li>
                    )}
                </ul>

                <div className="ed-row rel-add">
                    <span className="hcode">{hyp.code}</span>
                    <select value={relType} onChange={(e) => setRelType(e.target.value)}>
                        {KNOWN_RELATION_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                    <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
                        <option value="">대상 선택…</option>
                        {others.map((h) => (
                            <option key={h.id} value={h.id}>
                                {h.code} {h.text}
                            </option>
                        ))}
                    </select>
                    <button
                        className="primary"
                        disabled={!relTarget}
                        onClick={() => {
                            if (relTarget) {
                                onAddRelation(relType, relTarget);
                                setRelTarget("");
                            }
                        }}
                    >
                        추가
                    </button>
                </div>
            </div>
        </div>
    );
}
