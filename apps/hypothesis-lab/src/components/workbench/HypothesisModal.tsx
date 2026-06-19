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

/** 화살표가 의미 있는(방향성) 관계 타입. 나머지는 무방향(—)으로 표시. */
const DIRECTIONAL = new Set(["better_than", "parent_of"]);

/**
 * 현재 가설(좌측) 기준 화살표. 그래프와 동일하게 화살촉은 from(더 좋음/부모)을 가리킨다.
 *   currentIsFrom → 현재가 from → 화살표는 현재(좌) 쪽: "←"
 *   현재가 to     → 대상이 from → 화살표는 대상(우) 쪽: "→"
 */
function arrowFor(relationType: string, currentIsFrom: boolean): string {
    if (!DIRECTIONAL.has(relationType)) return "—";
    return currentIsFrom ? "←" : "→";
}

/** 정렬 순서·행 색상 모두 화살표 방향 기준. */
const ARROW_ORDER: Record<string, number> = { "←": 0, "→": 1, "—": 2 };
const ARROW_CLASS: Record<string, string> = {
    "←": styles.relLeft,
    "→": styles.relRight,
    "—": styles.relNone,
};

/** 가설 더블클릭 시 뜨는 태그·관계 설정 모달. 그래프 노드/목록 양쪽에서 공유. */
export function HypothesisModal() {
    const queryClient = useQueryClient();
    const hypId = useSelection((s) => s.modalHypothesisId);
    const close = useSelection((s) => s.closeHypothesisModal);
    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });

    const [tagName, setTagName] = useState("");
    const [relType, setRelType] = useState(KNOWN_RELATION_TYPES[0] as string);
    const [relTarget, setRelTarget] = useState("");
    // 화살표 방향: "left" = 현재←대상(현재가 from), "right" = 현재→대상(대상이 from).
    // 그래프는 화살촉을 from(더 좋음/부모) 쪽에 두므로 화살표가 from 을 가리킨다.
    const [relDir, setRelDir] = useState<"left" | "right">("left");

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
        setRelDir("left");
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
                        const others = data!.hypotheses.filter((h) => h.id !== hyp.id);

                        // 현재 가설이 얽힌 모든 관계를 "현재=좌측" 기준으로 통일한다.
                        // currentIsFrom: 현재가 from(=화살촉이 가리키는 쪽)이면 화살표는 현재(좌)를 향한다.
                        const rels = data!.hypothesisRelations
                            .filter((r) => r.fromHypothesisId === hyp.id || r.toHypothesisId === hyp.id)
                            .map((r) => {
                                const currentIsFrom = r.fromHypothesisId === hyp.id;
                                const otherId = currentIsFrom ? r.toHypothesisId : r.fromHypothesisId;
                                return {
                                    id: r.id,
                                    relationType: r.relationType,
                                    fromHypothesisId: r.fromHypothesisId,
                                    toHypothesisId: r.toHypothesisId,
                                    other: hypById.get(otherId),
                                    arrow: arrowFor(r.relationType, currentIsFrom),
                                };
                            })
                            // 화살표 방향이 같은 관계끼리 모이도록 정렬(← → —).
                            .sort((a, b) => ARROW_ORDER[a.arrow] - ARROW_ORDER[b.arrow]);

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
                                        {rels.map((r) => (
                                            <li
                                                key={r.id}
                                                className={`${styles.relRow} ${ARROW_CLASS[r.arrow] ?? ""}`}
                                            >
                                                <span className={styles.relSelf}>{hyp.code}</span>
                                                <span className={styles.relArrow}>{r.arrow}</span>
                                                <code className={styles.code}>{r.other?.code}</code>
                                                <span className={styles.relText}>{r.other?.text}</span>
                                                <span className={styles.relType}>{r.relationType}</span>
                                                <button
                                                    className={styles.relX}
                                                    onClick={() =>
                                                        mRemoveRel.mutate({
                                                            fromHypothesisId: r.fromHypothesisId,
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
                                        {rels.length === 0 && (
                                            <li className={styles.empty}>관계 없음</li>
                                        )}
                                    </ul>

                                    <div className={styles.relAdd}>
                                        <span className={styles.relSelf}>{hyp.code}</span>
                                        <button
                                            type="button"
                                            className={styles.dirBtn}
                                            disabled={!DIRECTIONAL.has(relType)}
                                            onClick={() =>
                                                setRelDir((d) => (d === "left" ? "right" : "left"))
                                            }
                                            title="화살표 방향 전환 (화살촉 = 더 좋음/부모)"
                                            aria-label="화살표 방향 전환"
                                        >
                                            {DIRECTIONAL.has(relType)
                                                ? relDir === "left"
                                                    ? "←"
                                                    : "→"
                                                : "—"}
                                        </button>
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
                                        <button
                                            className={styles.addBtn}
                                            disabled={!relTarget}
                                            onClick={() => {
                                                if (!relTarget) return;
                                                // ← 면 현재가 from, → 면 대상이 from.
                                                const dirLeft =
                                                    !DIRECTIONAL.has(relType) || relDir === "left";
                                                mAddRel.mutate({
                                                    fromHypothesisId: dirLeft ? hyp.id : relTarget,
                                                    toHypothesisId: dirLeft ? relTarget : hyp.id,
                                                    relationType: relType,
                                                });
                                                setRelTarget("");
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
