"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import { searchCases, type CaseSearchCriteria } from "@/services/caseSearch";
import { useSelection } from "@/stores/selection";
import styles from "./ExploreView.module.css";

type HypFilter = Record<string, "include" | "exclude">;

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function ExploreView() {
    const snapshot = useQuery({ queryKey: ["snapshot"], queryFn: () => loadSnapshotAction() });
    const [hypState, setHypState] = useState<HypFilter>({});
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [matchMode, setMatchMode] = useState<"or" | "and">("or");
    const [expandBetter, setExpandBetter] = useState(false);

    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);

    const data = snapshot.data ?? null;

    const results = useMemo(() => {
        if (!data) return [];
        const criteria: CaseSearchCriteria = {
            includeHypothesisIds: Object.keys(hypState).filter((id) => hypState[id] === "include"),
            excludeHypothesisIds: Object.keys(hypState).filter((id) => hypState[id] === "exclude"),
            includeTagIds: tagIds,
            expandBetterThan: expandBetter,
            matchMode,
        };
        return searchCases(data, criteria);
    }, [data, hypState, tagIds, matchMode, expandBetter]);

    if (!data) return <p className={cx(styles.muted, styles.pad)}>불러오는 중…</p>;

    const hypById = new Map(data.hypotheses.map((h) => [h.id, h]));
    const caseById = new Map(data.cases.map((c) => [c.caseId, c]));

    function cycle(id: string) {
        setHypState((s) => {
            const next = s[id] === undefined ? "include" : s[id] === "include" ? "exclude" : undefined;
            const copy = { ...s };
            if (next) copy[id] = next;
            else delete copy[id];
            return copy;
        });
    }
    function toggleTag(id: string) {
        setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
    }
    function reset() {
        setHypState({});
        setTagIds([]);
        setExpandBetter(false);
        setMatchMode("or");
    }

    return (
        <div className={styles.grid}>
            <aside className={styles.col}>
                <header className={styles.head}>
                    <h2>필터</h2>
                    <button className={styles.ghost} onClick={reset}>
                        초기화
                    </button>
                </header>

                <div className={styles.block}>
                    <div className={styles.filterRow}>
                        <span className={styles.filterLabel}>매칭</span>
                        <div className={styles.seg}>
                            <button
                                className={matchMode === "or" ? styles.active : ""}
                                onClick={() => setMatchMode("or")}
                            >
                                OR
                            </button>
                            <button
                                className={matchMode === "and" ? styles.active : ""}
                                onClick={() => setMatchMode("and")}
                            >
                                AND
                            </button>
                        </div>
                    </div>
                    <label className={styles.filterCheck}>
                        <input
                            type="checkbox"
                            checked={expandBetter}
                            onChange={(e) => setExpandBetter(e.target.checked)}
                        />
                        더 좋은 상황(better_than)까지 포함
                    </label>
                </div>

                <div className={styles.block}>
                    <h3>태그</h3>
                    <div className={styles.chips}>
                        {data.tags.map((t) => (
                            <button
                                key={t.id}
                                className={cx(styles.chip, tagIds.includes(t.id) && styles.on)}
                                onClick={() => toggleTag(t.id)}
                            >
                                #{t.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={cx(styles.block, styles.grow)}>
                    <h3>가설 (클릭: 포함 → 제외 → 해제)</h3>
                    <ul className={styles.hypotheses}>
                        {data.hypotheses.map((h) => {
                            const state = hypState[h.id];
                            return (
                                <li
                                    key={h.id}
                                    className={cx(
                                        styles.hypothesis,
                                        state === "include" && styles.include,
                                        state === "exclude" && styles.exclude,
                                    )}
                                    onClick={() => cycle(h.id)}
                                >
                                    <span className={styles.mark}>{state === "include" ? "+" : state === "exclude" ? "−" : ""}</span>
                                    <code className={styles.code}>{h.code}</code>
                                    <span className={styles.text}>{h.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </aside>

            <section className={styles.col}>
                <header className={styles.head}>
                    <h2>케이스 {results.length}건</h2>
                </header>
                {results.length === 0 && (
                    <p className={cx(styles.muted, styles.pad)}>조건에 맞는 케이스가 없습니다.</p>
                )}
                <ul className={styles.resultRows}>
                    {results.map((r) => {
                        const c = caseById.get(r.caseId);
                        return (
                            <li
                                key={r.caseId}
                                className={cx(styles.resultRow, r.caseId === selectedCaseId && styles.selected)}
                                onClick={() => selectCase(r.caseId)}
                            >
                                <div className={styles.resultHead}>
                                    <span className={styles.caseName}>{c?.stockName ?? c?.stockCode ?? r.caseId}</span>
                                    <span className={styles.caseMeta}>
                                        {c?.tradeDate}
                                        {c?.tradeTime ? ` ${c.tradeTime}` : ""}
                                    </span>
                                </div>
                                <div className={styles.resultSub}>
                                    <code className={styles.caseIdText}>{r.caseId}</code>
                                </div>
                                <div className={styles.resultHyps}>
                                    {r.linkedHypothesisIds.map((id) => {
                                        const h = hypById.get(id);
                                        const on = hypState[id] === "include";
                                        return (
                                            <span
                                                key={id}
                                                className={cx(styles.hypChip, on && styles.on)}
                                                title={h?.text}
                                            >
                                                {h?.code} {h?.text}
                                            </span>
                                        );
                                    })}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}
