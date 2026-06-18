"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSnapshotAction } from "@/actions/workbench";
import { searchCases, type CaseSearchCriteria } from "@/services/caseSearch";
import { useSelection } from "@/stores/selection";

type HypFilter = Record<string, "include" | "exclude">;

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

    if (!data) return <p className="muted pad">불러오는 중…</p>;

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
        <div className="exp-grid">
            <aside className="exp-controls wb-col">
                <header className="col-head">
                    <h2>필터</h2>
                    <button className="ghost" onClick={reset}>
                        초기화
                    </button>
                </header>

                <div className="filt-block">
                    <div className="filt-row">
                        <span className="filt-label">매칭</span>
                        <div className="seg">
                            <button
                                className={matchMode === "or" ? "is-active" : ""}
                                onClick={() => setMatchMode("or")}
                            >
                                OR
                            </button>
                            <button
                                className={matchMode === "and" ? "is-active" : ""}
                                onClick={() => setMatchMode("and")}
                            >
                                AND
                            </button>
                        </div>
                    </div>
                    <label className="filt-check">
                        <input
                            type="checkbox"
                            checked={expandBetter}
                            onChange={(e) => setExpandBetter(e.target.checked)}
                        />
                        더 좋은 상황(better_than)까지 포함
                    </label>
                </div>

                <div className="filt-block">
                    <h3>태그</h3>
                    <div className="chips">
                        {data.tags.map((t) => (
                            <button
                                key={t.id}
                                className={`chip${tagIds.includes(t.id) ? " is-on" : ""}`}
                                onClick={() => toggleTag(t.id)}
                            >
                                #{t.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="filt-block grow">
                    <h3>가설 (클릭: 포함 → 제외 → 해제)</h3>
                    <ul className="filt-hyps">
                        {data.hypotheses.map((h) => {
                            const state = hypState[h.id];
                            return (
                                <li
                                    key={h.id}
                                    className={`filt-hyp${state ? ` is-${state}` : ""}`}
                                    onClick={() => cycle(h.id)}
                                >
                                    <span className="mark">{state === "include" ? "+" : state === "exclude" ? "−" : ""}</span>
                                    <code className="hcode">{h.code}</code>
                                    <span className="htext">{h.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </aside>

            <section className="exp-results wb-col">
                <header className="col-head">
                    <h2>케이스 {results.length}건</h2>
                </header>
                {results.length === 0 && <p className="muted pad">조건에 맞는 케이스가 없습니다.</p>}
                <ul className="res-rows">
                    {results.map((r) => {
                        const c = caseById.get(r.caseId);
                        return (
                            <li
                                key={r.caseId}
                                className={`res-row${r.caseId === selectedCaseId ? " is-selected" : ""}`}
                                onClick={() => selectCase(r.caseId)}
                            >
                                <div className="res-head">
                                    <span className="case-name">{c?.stockName ?? c?.stockCode ?? r.caseId}</span>
                                    <span className="case-meta">
                                        {c?.tradeDate}
                                        {c?.tradeTime ? ` ${c.tradeTime}` : ""}
                                    </span>
                                </div>
                                <div className="res-sub">
                                    <code className="case-id-text">{r.caseId}</code>
                                </div>
                                <div className="res-hyps">
                                    {r.linkedHypothesisIds.map((id) => {
                                        const h = hypById.get(id);
                                        const on = hypState[id] === "include";
                                        return (
                                            <span key={id} className={`hyp-chip${on ? " is-on" : ""}`} title={h?.text}>
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
