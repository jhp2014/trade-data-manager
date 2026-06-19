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
import styles from "./EditView.module.css";

const STATUSES = ["draft", "active", "archived"];

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function statusClass(status: string) {
    if (status === "active") return styles.activeStatus;
    if (status === "draft") return styles.draftStatus;
    return "";
}

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
    if (!data) return <p className={cx(styles.muted, styles.pad)}>불러오는 중…</p>;

    const selected = data.hypotheses.find((h) => h.id === selectedHypothesisId) ?? null;

    return (
        <div className={styles.grid}>
            <aside className={styles.col}>
                <header className={styles.head}>
                    <h2>가설</h2>
                </header>
                <ul className={styles.list}>
                    {data.hypotheses.map((h) => (
                        <li
                            key={h.id}
                            className={cx(styles.hypRow, h.id === selectedHypothesisId && styles.selected)}
                            onClick={() => selectHypothesis(h.id)}
                        >
                            <code className={styles.code}>{h.code}</code>
                            <span className={cx(styles.status, statusClass(h.status))}>{h.status}</span>
                            <span className={styles.text}>{h.text}</span>
                        </li>
                    ))}
                </ul>
            </aside>

            <section className={styles.col}>
                {!selected && <p className={cx(styles.muted, styles.pad)}>편집할 가설을 선택하세요.</p>}
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
        <div className={styles.editor}>
            <header className={styles.head}>
                <h2>
                    <code className={styles.code}>{hyp.code}</code> 편집
                </h2>
            </header>

            <div className={styles.block}>
                <label className={styles.label}>가설 내용</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
                <div className={styles.row}>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    <button className={styles.primary} disabled={!dirty} onClick={() => onUpdate(text, status)}>
                        저장
                    </button>
                </div>
            </div>

            <div className={styles.block}>
                <label className={styles.label}>태그</label>
                <div className={styles.chips}>
                    {myTags.map((ht) => (
                        <span key={ht.tagId} className={cx(styles.chip, styles.chipOn)}>
                            #{tagNameById.get(ht.tagId) ?? ht.tagId}
                            <button className={styles.chipClose} onClick={() => onRemoveTag(ht.tagId)}>
                                ×
                            </button>
                        </span>
                    ))}
                    {myTags.length === 0 && <span className={cx(styles.muted, styles.sm)}>태그 없음</span>}
                </div>
                <div className={styles.row}>
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

            <div className={cx(styles.block, styles.grow)}>
                <label className={styles.label}>관계</label>
                <ul className={styles.relations}>
                    {outgoing.map((r) => (
                        <li key={r.id}>
                            <span className={styles.relType}>{r.relationType}</span>
                            <span className={styles.relArrow}>→</span>
                            <code className={styles.code}>{hypById.get(r.toHypothesisId)?.code}</code>
                            <span className={styles.text}>{hypById.get(r.toHypothesisId)?.text}</span>
                            <button
                                className={styles.chipClose}
                                onClick={() => onRemoveRelation(r.toHypothesisId, r.relationType, false)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                    {incoming.map((r) => (
                        <li key={r.id} className={styles.incoming}>
                            <code className={styles.code}>{hypById.get(r.fromHypothesisId)?.code}</code>
                            <span className={styles.text}>{hypById.get(r.fromHypothesisId)?.text}</span>
                            <span className={styles.relArrow}>→</span>
                            <span className={styles.relType}>{r.relationType}</span>
                            <button
                                className={styles.chipClose}
                                onClick={() => onRemoveRelation(r.fromHypothesisId, r.relationType, true)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                    {outgoing.length === 0 && incoming.length === 0 && (
                        <li className={cx(styles.muted, styles.sm)}>관계 없음</li>
                    )}
                </ul>

                <div className={cx(styles.row, styles.relAdd)}>
                    <span className={styles.code}>{hyp.code}</span>
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
                        className={styles.primary}
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
