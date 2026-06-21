"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    linkCaseAction,
    loadCasesAction,
    loadSnapshotAction,
    loadWorkingSetAction,
    setCaseNoteAction,
    setCaseOutcomeAction,
    unlinkCaseAction,
    type CaseSnapshotInput,
} from "@/actions/workbench";
import { useSelection } from "@/stores/selection";
import { tabKeyOf, useWorkbench, type CaseView } from "@/stores/workbench";
import { useSelectedCaseCopyShortcut } from "@/hooks/useSelectedCaseCopyShortcut";
import { usePasteCaseShortcut } from "@/hooks/usePasteCaseShortcut";
import type { WorkingSetCase } from "@/services/workingSet";
import { collectRefs, parseHypExpr, searchCasesByExpr } from "@/services/hypExpr";
import { matchHypSearch, parseHypSearchExpr } from "@/services/hypSearchExpr";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { HYP_INPUT_ID } from "@/lib/domIds";
import { HypothesisGraph } from "@/components/graph/HypothesisGraph";
import { CaseRail } from "./CaseRail";
import { WorkingSetRail } from "./WorkingSetRail";
import { SelectedCaseBadge } from "./SelectedCaseBadge";
import { GraphFilterStatus } from "./GraphFilterStatus";
import { CopyToast } from "./CopyToast";
import { HypothesisPanel } from "./HypothesisPanel";
import { HypothesisModal } from "./HypothesisModal";
import { HistoryModal } from "./HistoryModal";
import { SavedFilterModal } from "./SavedFilterModal";
import { WorkbenchSettingsModal } from "./WorkbenchSettingsModal";
import { HelpModal } from "./HelpModal";
import styles from "./Workbench.module.css";

/** view 토글에 맞는 케이스인지(Todo=미연결, Done=연결, All=전부). */
function matchesView(c: WorkingSetCase, view: CaseView): boolean {
    if (view === "all") return true;
    const linked = c.linkedHypothesisIds.length > 0;
    return view === "done" ? linked : !linked;
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

export function Workbench() {
    const queryClient = useQueryClient();
    const mode = useWorkbench((s) => s.mode);
    const filterMode = useWorkbench((s) => s.filterMode);
    const view = useWorkbench((s) => s.view);
    const expr = useWorkbench((s) => s.expr);
    const searchMode = useWorkbench((s) => s.searchMode);
    const searchQuery = useWorkbench((s) => s.searchQuery);
    const range = useWorkbench((s) => s.range);
    const sheetTab = useWorkbench((s) => s.sheetTab);
    const history = useWorkbench((s) => s.history);
    const addHistory = useWorkbench((s) => s.addHistory);
    const setFilterMode = useWorkbench((s) => s.setFilterMode);
    const selectWorkingSet = useWorkbench((s) => s.selectWorkingSet);
    const setFilterOpen = useWorkbench((s) => s.setFilterOpen);
    // 모달이 열려 있으면 전역 단축키를 끈다(모달 자체 입력/조작 우선).
    const settingsOpen = useWorkbench((s) => s.settingsOpen);
    const historyModalOpen = useWorkbench((s) => s.historyModalOpen);
    const savedFilterModal = useWorkbench((s) => s.savedFilterModal);
    const helpOpen = useWorkbench((s) => s.helpOpen);
    const positions = useWorkbench((s) => s.positions);
    const setPosition = useWorkbench((s) => s.setPosition);
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);
    const modalHypothesisId = useSelection((s) => s.modalHypothesisId);

    const workingSet = useQuery({
        queryKey: ["workingSet", mode],
        queryFn: () => loadWorkingSetAction(mode),
        enabled: filterMode === "workingset",
    });
    const historyCases = useQuery({
        queryKey: ["historyCases", history],
        queryFn: () => loadCasesAction(history),
        enabled: filterMode === "history" && history.length > 0,
    });
    const snapshot = useQuery({
        queryKey: ["snapshot"],
        queryFn: () => loadSnapshotAction(),
    });

    // 불리언 모드: 식을 파싱해 snapshot.cases 전체에 평가하고, 결과 caseId 를
    // snapshot.cases 의 값으로 되살려 레일 행으로 만든다(서버 왕복 없이 클라 파생).
    const parsed = useMemo(
        () => (filterMode === "boolean" && expr.trim() !== "" ? parseHypExpr(expr) : null),
        [filterMode, expr],
    );
    const booleanCases = useMemo<WorkingSetCase[]>(() => {
        const snap = snapshot.data;
        if (!snap || !parsed || !parsed.ok) return [];
        const byId = new Map(snap.cases.map((c) => [c.caseId, c]));
        return searchCasesByExpr(snap, parsed.expr).flatMap((r) => {
            const c = byId.get(r.caseId);
            if (!c) return [];
            return [
                {
                    caseId: c.caseId,
                    stockCode: c.stockCode,
                    stockName: c.stockName,
                    tradeDate: c.tradeDate,
                    tradeTime: c.tradeTime,
                    outcome: c.outcome,
                    note: c.note,
                    existsInReview: true,
                    linkedHypothesisIds: r.linkedHypothesisIds,
                },
            ];
        });
    }, [snapshot.data, parsed]);

    // Date/Sheet/History 스코프: 실제 타점(point)이 있는 케이스만.
    // existsInReview=false(리뷰에 없음) 또는 tradeTime 없음(종목-날짜 target 만, 타점 X)은 숨긴다.
    const scopeCases = useMemo(() => {
        const src =
            filterMode === "history"
                ? (historyCases.data ?? [])
                : (workingSet.data?.cases ?? []);
        return src.filter((c) => c.existsInReview && c.tradeTime != null);
    }, [filterMode, historyCases.data, workingSet.data]);

    // 현재 모드의 기준 케이스 집합(view 필터 적용 전). boolean 도 view(All/Todo/Done)를
    // 적용한다 — !조건 결과에 미연결(Todo) 케이스가 섞일 수 있기 때문.
    const baseCases = useMemo(
        () => (filterMode === "boolean" ? booleanCases : scopeCases),
        [filterMode, booleanCases, scopeCases],
    );

    // All/Todo/Done 토글용 건수(기준 집합 기준, view 필터 적용 전).
    const viewCounts = useMemo(() => {
        let todo = 0;
        for (const c of baseCases) if (c.linkedHypothesisIds.length === 0) todo++;
        return { all: baseCases.length, todo, done: baseCases.length - todo };
    }, [baseCases]);

    // memo 화 필수: 매 렌더 새 배열이면 아래 선택/위치 effect 가 무한 재실행된다.
    const railCases = useMemo(
        () => baseCases.filter((c) => matchesView(c, view)),
        [baseCases, view],
    );

    // caseId → 케이스(outcome/note 저장 시 snapshot 입력 구성용). 기준 집합 전체에서.
    const caseById = useMemo(() => new Map(baseCases.map((c) => [c.caseId, c])), [baseCases]);
    const railLoading =
        filterMode === "boolean"
            ? snapshot.isLoading
            : filterMode === "history"
              ? historyCases.isLoading
              : workingSet.isLoading;

    const tabKey = tabKeyOf(filterMode, mode);

    // 레일이 로드되면 선택을 복구한다. 현재 선택이 레일에 있으면 유지하고,
    // 없으면 이 탭에 저장된 위치(positions[tabKey])로, 그것도 없으면 첫 케이스로.
    useEffect(() => {
        if (railCases.length === 0) return;
        if (selectedCaseId && railCases.some((c) => c.caseId === selectedCaseId)) return;
        const saved = positions[tabKey];
        const target =
            saved && railCases.some((c) => c.caseId === saved) ? saved : railCases[0].caseId;
        selectCase(target);
    }, [railCases, selectedCaseId, selectCase, positions, tabKey]);

    // 현재 선택을 탭별 위치로 저장(탭을 다시 열면 이어서 탐색). 레일에 실재하는
    // 선택만 기록해, 탭 전환 직후의 옛 선택으로 덮어쓰지 않는다.
    useEffect(() => {
        if (!selectedCaseId) return;
        if (!railCases.some((c) => c.caseId === selectedCaseId)) return;
        setPosition(tabKey, selectedCaseId);
    }, [selectedCaseId, railCases, tabKey, setPosition]);

    // Ctrl+V 로 caseId 탐색: 항상 History 에 적재하고, 현재 레일에 있으면 그 자리에서
    // 선택, 없으면 History 탭으로 전환해 선택한다.
    const onPasteCase = useCallback(
        (caseId: string) => {
            addHistory(caseId);
            if (!railCases.some((c) => c.caseId === caseId)) setFilterMode("history");
            selectCase(caseId);
        },
        [railCases, addHistory, setFilterMode, selectCase],
    );
    usePasteCaseShortcut(onPasteCase);

    const selectedCase = railCases.find((c) => c.caseId === selectedCaseId) ?? null;
    const [copyMsg, setCopyMsg] = useState<{ id: number; text: string } | null>(null);
    const clearCopyMsg = useCallback(() => setCopyMsg(null), []);
    const onCaseCopied = useCallback(() => {
        if (!selectedCase) return;
        const name = selectedCase.stockName ?? selectedCase.stockCode ?? selectedCase.caseId;
        const when = [selectedCase.tradeDate, selectedCase.tradeTime].filter(Boolean).join(" ");
        const text = when ? `복사됨 · ${name} · ${when}` : `복사됨 · ${name}`;
        setCopyMsg({ id: Date.now(), text });
    }, [selectedCase]);
    useSelectedCaseCopyShortcut(selectedCase?.caseId ?? null, onCaseCopied);

    // 시트 탭을 못 읽으면 안내와 함께 기간 모드로 자동 전환한다. 전환하면 mode 가
    // sheet 에서 벗어나 다음 쿼리엔 sheetError 가 없어 재전환 루프가 생기지 않는다.
    const sheetError = workingSet.data?.sheetError;
    useEffect(() => {
        if (!sheetError) return;
        selectWorkingSet({ kind: "review-range", ...range });
        const text =
            sheetError.kind === "tab-missing"
                ? `시트 탭 '${sheetError.tab}'을(를) 찾을 수 없어 기간 모드로 전환했습니다`
                : "시트를 읽을 수 없어 기간 모드로 전환했습니다";
        setCopyMsg({ id: Date.now(), text });
    }, [sheetError, selectWorkingSet, range]);

    // 그래프 노드 체크박스 → 현재 케이스 연결/해제.
    const { mutate: linkMutate } = useMutation({
        mutationFn: (v: { hypothesisId: string; case: CaseSnapshotInput }) => linkCaseAction(v),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
        },
    });
    const { mutate: unlinkMutate } = useMutation({
        mutationFn: (v: { hypothesisId: string; caseId: string }) => unlinkCaseAction(v),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
        },
    });
    const handleToggleCaseLink = useCallback(
        (hypothesisId: string, link: boolean) => {
            if (!selectedCase) return;
            if (link) linkMutate({ hypothesisId, case: toCaseInput(selectedCase) });
            else unlinkMutate({ hypothesisId, caseId: selectedCase.caseId });
        },
        [selectedCase, linkMutate, unlinkMutate],
    );

    // 케이스 카드 더블클릭 → outcome 설정(null=해제). cases 행이 없을 수 있어
    // 액션에서 ensureCase 하도록 케이스 스냅샷 전체를 넘긴다.
    const { mutate: outcomeMutate } = useMutation({
        mutationFn: (v: { case: CaseSnapshotInput; outcome: string | null }) =>
            setCaseOutcomeAction(v),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
            queryClient.invalidateQueries({ queryKey: ["historyCases"] });
        },
    });
    const handleSetOutcome = useCallback(
        (caseId: string, outcome: string | null) => {
            const c = caseById.get(caseId);
            if (c) outcomeMutate({ case: toCaseInput(c), outcome });
        },
        [caseById, outcomeMutate],
    );

    // 케이스 카드 더블클릭 → 메모 설정(null=제거).
    const { mutate: noteMutate } = useMutation({
        mutationFn: (v: { case: CaseSnapshotInput; note: string | null }) => setCaseNoteAction(v),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
            queryClient.invalidateQueries({ queryKey: ["historyCases"] });
        },
    });
    const handleSetNote = useCallback(
        (caseId: string, note: string | null) => {
            const c = caseById.get(caseId);
            if (c) noteMutate({ case: toCaseInput(c), note });
        },
        [caseById, noteMutate],
    );

    // 레일 케이스 이동(a=이전, d=다음).
    const moveCase = useCallback(
        (delta: number) => {
            if (railCases.length === 0) return;
            const idx = railCases.findIndex((c) => c.caseId === selectedCaseId);
            const cur = idx < 0 ? 0 : idx;
            const next = cur + delta;
            if (next < 0 || next >= railCases.length) return;
            selectCase(railCases[next].caseId);
        },
        [railCases, selectedCaseId, selectCase],
    );

    // 전역 단축키. 새 단축키는 이 목록에 항목만 추가하면 된다(입력 중 무시·수식키
    // 매칭은 훅이 처리). 모달이 열려 있으면 전체를 끈다.
    const anyModalOpen =
        !!modalHypothesisId ||
        settingsOpen ||
        historyModalOpen ||
        savedFilterModal !== null ||
        helpOpen;
    useKeyboardShortcuts(
        [
            // Space: 가설 추가/검색 입력칸 포커스. 버튼/링크 포커스 중이면 기본 동작 보존.
            {
                key: "space",
                handler: (e) => {
                    const tag = (document.activeElement as HTMLElement | null)?.tagName;
                    if (tag === "BUTTON" || tag === "A") return;
                    e.preventDefault();
                    document.getElementById(HYP_INPUT_ID)?.focus();
                },
            },
            // Ctrl+Space: 입력칸에서 포커스 해제(a/d 탐색 복귀). 입력 중에도 동작.
            {
                key: "space",
                ctrl: true,
                allowInInput: true,
                handler: (e) => {
                    e.preventDefault();
                    (document.activeElement as HTMLElement | null)?.blur();
                },
            },
            // f: 필터 식 입력칸 포커스(필터 모드 전환 + 플라이아웃 열기 → 자동 포커스).
            {
                key: "f",
                handler: (e) => {
                    e.preventDefault();
                    setFilterMode("boolean");
                    setFilterOpen(true);
                },
            },
            // 1~4: 작업셋 전환.
            { key: "1", handler: () => selectWorkingSet({ kind: "review-range", ...range }) },
            { key: "2", handler: () => selectWorkingSet({ kind: "sheet", tab: sheetTab }) },
            { key: "3", handler: () => setFilterMode("history") },
            { key: "4", handler: () => setFilterMode("boolean") },
            // a/d: 레일 케이스 이전/다음.
            { key: "a", handler: () => moveCase(-1) },
            { key: "d", handler: () => moveCase(1) },
        ],
        !anyModalOpen,
    );

    // 케이스별 연결된 가설 수(카드 배지용).
    const linkedCountByCase = useMemo(() => {
        const m = new Map<string, number>();
        const snap = snapshot.data;
        if (!snap) return m;
        for (const hc of snap.hypothesisCases) {
            m.set(hc.caseId, (m.get(hc.caseId) ?? 0) + 1);
        }
        return m;
    }, [snapshot.data]);

    const linkedToSelectedCase = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !selectedCaseId) return [];
        return snap.hypothesisCases
            .filter((hc) => hc.caseId === selectedCaseId)
            .map((hc) => hc.hypothesisId);
    }, [snapshot.data, selectedCaseId]);

    // 불리언 모드에서 현재 식에 등장하는 가설 id(코드→id). 그래프 노드에 필터 칩 표시용.
    const filterHypothesisIds = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || filterMode !== "boolean" || !parsed || !parsed.ok) return [];
        const idByCode = new Map(snap.hypotheses.map((h) => [h.code, h.id]));
        return collectRefs(parsed.expr).flatMap((code) => {
            const id = idByCode.get(code);
            return id ? [id] : [];
        });
    }, [snapshot.data, filterMode, parsed]);

    // 가설 검색식(패널 검색 모드와 공유) → 그래프 디밍용 매칭 집합.
    // 유효 식일 때만 활성, 비매치 노드를 흐리게 한다(다른 표시와 공존).
    const searchParsed = useMemo(
        () => (searchMode && searchQuery.trim() !== "" ? parseHypSearchExpr(searchQuery) : null),
        [searchMode, searchQuery],
    );
    const searchActive = searchParsed?.ok === true;
    const searchMatchedIds = useMemo(() => {
        const snap = snapshot.data;
        if (!snap || !searchParsed?.ok) return [];
        const tagName = new Map(snap.tags.map((t) => [t.id, t.name]));
        const tagsByHyp = new Map<string, string[]>();
        for (const ht of snap.hypothesisTags) {
            const arr = tagsByHyp.get(ht.hypothesisId) ?? [];
            arr.push(tagName.get(ht.tagId) ?? "");
            tagsByHyp.set(ht.hypothesisId, arr);
        }
        return snap.hypotheses
            .filter((h) =>
                matchHypSearch(searchParsed.expr, { text: h.text, tags: tagsByHyp.get(h.id) ?? [] }),
            )
            .map((h) => h.id);
    }, [snapshot.data, searchParsed]);

    return (
        <div className={styles.layout}>
            <div className={styles.leftCol}>
                <WorkingSetRail viewCounts={viewCounts} />
                <div className={styles.panel}>
                    <HypothesisPanel
                        snapshot={snapshot.data ?? null}
                        selectedCase={selectedCase}
                        expr={filterMode === "boolean" && parsed?.ok ? parsed.expr : null}
                    />
                </div>
            </div>
            <div className={styles.rightCol}>
                <div className={styles.caseRow}>
                    <CaseRail
                        cases={railCases}
                        loading={railLoading}
                        linkedCountByCase={linkedCountByCase}
                        onSetOutcome={handleSetOutcome}
                        onSetNote={handleSetNote}
                    />
                </div>
                <div className={styles.graph}>
                    {(selectedCase || filterMode === "boolean") && (
                        <div className={styles.graphOverlay}>
                            {selectedCase && (
                                <SelectedCaseBadge
                                    c={selectedCase}
                                    linkedCount={linkedCountByCase.get(selectedCase.caseId) ?? 0}
                                />
                            )}
                            {filterMode === "boolean" && <GraphFilterStatus />}
                        </div>
                    )}
                    <HypothesisGraph
                        snapshot={snapshot.data ?? null}
                        highlightHypothesisIds={linkedToSelectedCase}
                        filterHypothesisIds={filterHypothesisIds}
                        searchMatchedIds={searchMatchedIds}
                        searchActive={searchActive}
                        caseSelected={!!selectedCase}
                        onToggleCaseLink={handleToggleCaseLink}
                    />
                    {copyMsg && (
                        <CopyToast key={copyMsg.id} text={copyMsg.text} onDone={clearCopyMsg} />
                    )}
                </div>
            </div>
            <WorkbenchSettingsModal />
            <HelpModal />
            <HistoryModal />
            <SavedFilterModal />
            <HypothesisModal />
        </div>
    );
}
