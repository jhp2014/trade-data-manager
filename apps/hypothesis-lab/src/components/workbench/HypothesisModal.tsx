"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import {
    addTagAction,
    removeRelationAction,
    removeTagAction,
    upsertRelationAction,
} from "@/actions/edit";
import { KNOWN_RELATION_TYPES } from "@/domain/validation";
import { useSelection } from "@/stores/selection";
import styles from "./HypothesisModal.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/** 가설 더블클릭 시 뜨는 태그·관계 설정 모달. 그래프 노드/목록 양쪽에서 공유. */
export function HypothesisModal() {
    const queryClient = useQueryClient();
    const hypId = useSelection((s) => s.modalHypothesisId);
    const close = useSelection((s) => s.closeHypothesisModal);
    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });

    const [tagName, setTagName] = useState("");
    const [relType, setRelType] = useState(KNOWN_RELATION_TYPES[0] as string);
    const [relTarget, setRelTarget] = useState("");

    useEffect(() => {
        if (!hypId) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") close();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [hypId, close]);

    // 대상 가설이 바뀌면 입력값 초기화.
    useEffect(() => {
        setTagName("");
        setRelTarget("");
    }, [hypId]);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["workingSet"] });
    };
    const mAddTag = useMutation({
        mutationFn: (v: { hypothesisId: string; tagName: string }) => addTagAction(v),
        onSuccess: refresh,
    });
    const mRemoveTag = useMutation({
        mutationFn: (v: { hypothesisId: string; tagId: string }) => removeTagAction(v),
        onSuccess: refresh,
    });
    const mAddRel = useMutation({
        mutationFn: (v: { fromHypothesisId: string; toHypothesisId: string; relationType: string }) =>
            upsertRelationAction(v),
        onSuccess: refresh,
    });
    const mRemoveRel = useMutation({
        mutationFn: (v: { fromHypothesisId: string; toHypothesisId: string; relationType: string }) =>
            removeRelationAction(v),
        onSuccess: refresh,
    });

    if (!hypId) return null;
    const data = snapshot.data;
    const hyp = data?.hypotheses.find((h) => h.id === hypId) ?? null;

    return (
        <div className={styles.overlay} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {!hyp ? (
                    <div className={styles.loading}>불러오는 중…</div>
                ) : (
                    (() => {
                        const tagNameById = new Map(data!.tags.map((t) => [t.id, t.name]));
                        const hypById = new Map(data!.hypotheses.map((h) => [h.id, h]));
                        const myTags = data!.hypothesisTags.filter((ht) => ht.hypothesisId === hyp.id);
                        const outgoing = data!.hypothesisRelations.filter(
                            (r) => r.fromHypothesisId === hyp.id,
                        );
                        const incoming = data!.hypothesisRelations.filter(
                            (r) => r.toHypothesisId === hyp.id,
                        );
                        const others = data!.hypotheses.filter((h) => h.id !== hyp.id);

                        return (
                            <>
                                <header className={styles.head}>
                                    <div className={styles.title}>
                                        <code className={styles.code}>{hyp.code}</code>
                                        <span className={styles.titleText}>{hyp.text}</span>
                                    </div>
                                    <button className={styles.x} onClick={close} aria-label="닫기">
                                        ×
                                    </button>
                                </header>

                                <section className={styles.section}>
                                    <h3>태그</h3>
                                    <div className={styles.chips}>
                                        {myTags.map((ht) => (
                                            <span key={ht.tagId} className={styles.chip}>
                                                #{tagNameById.get(ht.tagId) ?? ht.tagId}
                                                <button
                                                    className={styles.chipX}
                                                    onClick={() =>
                                                        mRemoveTag.mutate({
                                                            hypothesisId: hyp.id,
                                                            tagId: ht.tagId,
                                                        })
                                                    }
                                                    aria-label="태그 제거"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                        {myTags.length === 0 && (
                                            <span className={styles.empty}>태그 없음</span>
                                        )}
                                    </div>
                                    <input
                                        className={styles.input}
                                        value={tagName}
                                        onChange={(e) => setTagName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && tagName.trim()) {
                                                mAddTag.mutate({
                                                    hypothesisId: hyp.id,
                                                    tagName: tagName.trim(),
                                                });
                                                setTagName("");
                                            }
                                        }}
                                        placeholder="태그 추가 후 Enter"
                                        list="modal-tag-options"
                                    />
                                    <datalist id="modal-tag-options">
                                        {data!.tags.map((t) => (
                                            <option key={t.id} value={t.name} />
                                        ))}
                                    </datalist>
                                </section>

                                <section className={styles.section}>
                                    <h3>관계</h3>
                                    <ul className={styles.relations}>
                                        {outgoing.map((r) => (
                                            <li key={r.id} className={styles.relRow}>
                                                <span className={styles.relSelf}>{hyp.code}</span>
                                                <span className={styles.relType}>{r.relationType}</span>
                                                <span className={styles.relArrow}>→</span>
                                                <code className={styles.code}>
                                                    {hypById.get(r.toHypothesisId)?.code}
                                                </code>
                                                <span className={styles.relText}>
                                                    {hypById.get(r.toHypothesisId)?.text}
                                                </span>
                                                <button
                                                    className={styles.relX}
                                                    onClick={() =>
                                                        mRemoveRel.mutate({
                                                            fromHypothesisId: hyp.id,
                                                            toHypothesisId: r.toHypothesisId,
                                                            relationType: r.relationType,
                                                        })
                                                    }
                                                    aria-label="관계 제거"
                                                >
                                                    ×
                                                </button>
                                            </li>
                                        ))}
                                        {incoming.map((r) => (
                                            <li key={r.id} className={cx(styles.relRow, styles.relIn)}>
                                                <code className={styles.code}>
                                                    {hypById.get(r.fromHypothesisId)?.code}
                                                </code>
                                                <span className={styles.relText}>
                                                    {hypById.get(r.fromHypothesisId)?.text}
                                                </span>
                                                <span className={styles.relArrow}>→</span>
                                                <span className={styles.relType}>{r.relationType}</span>
                                                <span className={styles.relSelf}>{hyp.code}</span>
                                                <button
                                                    className={styles.relX}
                                                    onClick={() =>
                                                        mRemoveRel.mutate({
                                                            fromHypothesisId: r.fromHypothesisId,
                                                            toHypothesisId: hyp.id,
                                                            relationType: r.relationType,
                                                        })
                                                    }
                                                    aria-label="관계 제거"
                                                >
                                                    ×
                                                </button>
                                            </li>
                                        ))}
                                        {outgoing.length === 0 && incoming.length === 0 && (
                                            <li className={styles.empty}>관계 없음</li>
                                        )}
                                    </ul>

                                    <div className={styles.relAdd}>
                                        <span className={styles.relSelf}>{hyp.code}</span>
                                        <select
                                            className={styles.select}
                                            value={relType}
                                            onChange={(e) => setRelType(e.target.value)}
                                        >
                                            {KNOWN_RELATION_TYPES.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            className={styles.select}
                                            value={relTarget}
                                            onChange={(e) => setRelTarget(e.target.value)}
                                        >
                                            <option value="">대상 선택…</option>
                                            {others.map((h) => (
                                                <option key={h.id} value={h.id}>
                                                    {h.code} {h.text}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            className={styles.addBtn}
                                            disabled={!relTarget}
                                            onClick={() => {
                                                if (relTarget) {
                                                    mAddRel.mutate({
                                                        fromHypothesisId: hyp.id,
                                                        toHypothesisId: relTarget,
                                                        relationType: relType,
                                                    });
                                                    setRelTarget("");
                                                }
                                            }}
                                        >
                                            추가
                                        </button>
                                    </div>
                                </section>
                            </>
                        );
                    })()
                )}
            </div>
        </div>
    );
}
