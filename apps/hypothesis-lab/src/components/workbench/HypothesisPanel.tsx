"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    createHypothesisAction,
    linkCaseAction,
    unlinkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import { deleteHypothesisAction } from "@/actions/edit";
import type { Hypothesis, HypothesisSnapshot } from "@/domain/types";
import type { WorkingSetCase } from "@/services/workingSet";
import { collectRefs, type HypExpr } from "@/services/hypExpr";
import { matchHypSearch, parseHypSearchExpr } from "@/services/hypSearchExpr";
import { useSelection } from "@/stores/selection";
import { useWorkbench } from "@/stores/workbench";
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

function EnterIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 10l-5 5 5 5" />
            <path d="M4 15h12a4 4 0 0 0 4-4V4" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
        </svg>
    );
}

// 추가/검색 모드 전환 스위치.
function ToggleIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3l4 4-4 4" />
            <path d="M21 7H7" />
            <path d="M7 21l-4-4 4-4" />
            <path d="M3 17h14" />
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
    expr,
}: {
    snapshot: HypothesisSnapshot | null;
    selectedCase: WorkingSetCase | null;
    /** 불리언 모드에서 파싱된 식. 있으면 식 트리 구조대로 가설을 그룹 렌더한다. */
    expr?: HypExpr | null;
}) {
    const queryClient = useQueryClient();
    const selectedHypothesisId = useSelection((s) => s.selectedHypothesisId);
    const selectHypothesis = useSelection((s) => s.selectHypothesis);
    const openHypothesisModal = useSelection((s) => s.openHypothesisModal);
    const appendOrCycleRef = useWorkbench((s) => s.appendOrCycleRef);
    const removeRef = useWorkbench((s) => s.removeRef);
    const [text, setText] = useState("");
    // 검색 모드/검색어는 store(작업대 공유) — 그래프 디밍과 동일 소스를 쓴다.
    const searchMode = useWorkbench((s) => s.searchMode);
    const setSearchMode = useWorkbench((s) => s.setSearchMode);
    const query = useWorkbench((s) => s.searchQuery);
    const setQuery = useWorkbench((s) => s.setSearchQuery);

    // 검색 모드 식 파싱(빈 식이면 null). 매칭 평가는 snapshot 로드 후 수행.
    const searchParsed = useMemo(() => {
        if (!searchMode || query.trim() === "") return null;
        return parseHypSearchExpr(query);
    }, [searchMode, query]);
    const searchError = searchParsed && !searchParsed.ok ? searchParsed.error : null;

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

    // 검색 매칭 집합(유효 식일 때만). 행 하이라이트·상단 정렬·건수에 공용.
    const matchedIds = new Set<string>();
    if (searchParsed?.ok) {
        for (const h of snapshot.hypotheses) {
            if (matchHypSearch(searchParsed.expr, { text: h.text, tags: tagsByHyp.get(h.id) ?? [] })) {
                matchedIds.add(h.id);
            }
        }
    }

    // 검색 매칭 > 현재 케이스 연결 순으로 위로 모아 UI 로 구분.
    const ordered =
        searchParsed?.ok || selectedCase
            ? [...snapshot.hypotheses].sort((a, b) => {
                  const m = Number(matchedIds.has(b.id)) - Number(matchedIds.has(a.id));
                  if (m !== 0) return m;
                  return Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id));
              })
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

    // 가설 한 행. 평면 목록과 불리언 그룹 트리에서 공용으로 쓴다.
    // negated=true 면 NOT 리프(빨강) 표시.
    const renderRow = (h: Hypothesis, negated = false) => {
        const linked = linkedIds.has(h.id);
        const tags = tagsByHyp.get(h.id) ?? [];
        const cnt = caseCount.get(h.id) ?? 0;
        return (
            <div
                key={h.id}
                className={cx(
                    styles.row,
                    h.id === selectedHypothesisId && styles.selected,
                    linked && styles.linked,
                    negated && styles.negated,
                    matchedIds.has(h.id) && styles.match,
                )}
                onClick={() => selectHypothesis(h.id)}
                onDoubleClick={() => openHypothesisModal(h.id)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (e.shiftKey) removeRef(h.code);
                    else appendOrCycleRef(h.code);
                }}
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
                        {negated && <span className={styles.notMark}>NOT</span>}
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
            </div>
        );
    };

    // 식 트리를 그대로 중첩 박스로 렌더. and/or=테두리 그룹 + 게이트(·/+),
    // not 리프=빨강, not 그룹=NOT 배지 래퍼, 알 수 없는 코드=경고 칩.
    const byCode = new Map(snapshot.hypotheses.map((h) => [h.code, h]));
    const renderNode = (node: HypExpr, key: string): ReactNode => {
        switch (node.kind) {
            case "ref": {
                const h = byCode.get(node.code);
                if (!h) {
                    return (
                        <div key={key} className={styles.unknownLeaf}>
                            {node.code} <span>알 수 없는 코드</span>
                        </div>
                    );
                }
                return <Fragment key={key}>{renderRow(h)}</Fragment>;
            }
            case "not": {
                const child = node.expr;
                if (child.kind === "ref") {
                    const h = byCode.get(child.code);
                    if (!h) {
                        return (
                            <div key={key} className={cx(styles.unknownLeaf, styles.negated)}>
                                NOT {child.code} <span>알 수 없는 코드</span>
                            </div>
                        );
                    }
                    return <Fragment key={key}>{renderRow(h, true)}</Fragment>;
                }
                return (
                    <div key={key} className={styles.notWrap}>
                        <span className={styles.notBadge}>NOT</span>
                        {renderNode(child, `${key}.n`)}
                    </div>
                );
            }
            default: {
                const gate = node.kind === "and" ? "AND" : "OR";
                return (
                    <div key={key} className={styles.group}>
                        {node.items.map((it, i) => (
                            <Fragment key={i}>
                                {i > 0 && <div className={styles.gate}>{gate}</div>}
                                {renderNode(it, `${key}.${i}`)}
                            </Fragment>
                        ))}
                    </div>
                );
            }
        }
    };

    // 불리언 모드: 식에 등장하는 가설은 트리로, 나머지는 구분선 아래 ID순으로.
    const exprRefs = expr ? new Set(collectRefs(expr)) : null;
    const rest = exprRefs
        ? snapshot.hypotheses.filter((h) => !exprRefs.has(h.code))
        : [];

    return (
        <div className={styles.panel}>
            {/* 가설 추가/검색 입력 — 리스트 상단. 스위치로 모드 전환. */}
            <div className={styles.newHyp}>
                <div className={cx(styles.field, searchError && styles.fieldError)}>
                    {searchMode && query.trim() !== "" && (
                        <span
                            className={cx(styles.matchBadge, searchError && styles.matchError)}
                            title={searchError ?? `${matchedIds.size}건 매칭`}
                        >
                            {searchError ? "오류" : `${matchedIds.size}건`}
                        </span>
                    )}
                    <input
                        value={searchMode ? query : text}
                        onChange={(e) =>
                            searchMode ? setQuery(e.target.value) : setText(e.target.value)
                        }
                        onKeyDown={(e) => !searchMode && e.key === "Enter" && addHypothesis()}
                        placeholder={
                            searchMode
                                ? "가설 검색 — 예) 삼성 #급등 | !장기"
                                : selectedCase
                                  ? "새 가설 입력 후 Enter (선택 케이스에 연결)"
                                  : "새 가설 입력 후 Enter"
                        }
                        spellCheck={searchMode ? false : undefined}
                    />
                    <button
                        className={cx(styles.toggle, searchMode && styles.toggleActive)}
                        onClick={() => setSearchMode(!searchMode)}
                        title={searchMode ? "가설 추가 모드로 전환" : "가설 검색 모드로 전환"}
                        aria-label={searchMode ? "가설 추가 모드로 전환" : "가설 검색 모드로 전환"}
                    >
                        <ToggleIcon />
                    </button>
                    {searchMode ? (
                        <button
                            onClick={() => setQuery("")}
                            disabled={query === ""}
                            title="검색어 지우기"
                            aria-label="검색어 지우기"
                        >
                            <SearchIcon />
                        </button>
                    ) : (
                        <button
                            onClick={addHypothesis}
                            disabled={createMut.isPending || !text.trim()}
                            title={selectedCase ? "추가 후 선택 케이스에 연결" : "가설 추가"}
                            aria-label={selectedCase ? "추가 후 선택 케이스에 연결" : "가설 추가"}
                        >
                            <EnterIcon />
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.list}>
                {expr ? (
                    <>
                        {renderNode(expr, "root")}
                        {rest.length > 0 && (
                            <div className={styles.divider}>식에 없는 가설</div>
                        )}
                        {rest.map((h) => renderRow(h))}
                    </>
                ) : (
                    ordered.map((h) => renderRow(h))
                )}
            </div>
        </div>
    );
}
