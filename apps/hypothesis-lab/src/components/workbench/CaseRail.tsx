"use client";

import { useEffect, useRef } from "react";
import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";
import { CaseCard } from "./CaseCard";
import styles from "./CaseRail.module.css";

const noop = () => {};

// 빈 상태에서 좌측에 보여줄 예시 카드 — 실제 데이터 화면과 동일한 골격을 유지한다.
const MOCK_CASE: WorkingSetCase = {
    caseId: "MOCK-SAMPLE",
    stockCode: "000000",
    stockName: "예시 종목",
    tradeDate: "2025-01-02",
    tradeTime: "09:31",
    outcome: "win",
    note: "여기는 예시(mock) 카드입니다.",
    existsInReview: true,
    linkedHypothesisIds: [],
};

export function CaseRail({
    cases,
    loading,
    linkedCountByCase,
    onSetOutcome,
    onSetNote,
}: {
    cases: WorkingSetCase[];
    loading: boolean;
    linkedCountByCase: Map<string, number>;
    onSetOutcome: (caseId: string, outcome: string | null) => void;
    onSetNote: (caseId: string, note: string | null) => void;
}) {
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);
    const scrollRef = useRef<HTMLDivElement>(null);
    const targetRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    const selectedCase = cases.find((c) => c.caseId === selectedCaseId) ?? null;

    // 세로 휠 → 가로 스크롤. requestAnimationFrame 으로 목표값까지 이징해
    // 노치 단위로 뚝뚝 끊기지 않고 부드럽게 흐르도록 한다.
    function onWheel(e: React.WheelEvent<HTMLDivElement>) {
        const el = scrollRef.current;
        if (!el) return;
        const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (delta === 0) return;
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 0) return;
        // 유휴 상태면 목표를 현재 위치로 재동기화(스크롤바·키보드 이동 반영).
        if (rafRef.current == null) targetRef.current = el.scrollLeft;
        targetRef.current = Math.max(0, Math.min(max, targetRef.current + delta));

        const step = () => {
            const node = scrollRef.current;
            if (!node) {
                rafRef.current = null;
                return;
            }
            const diff = targetRef.current - node.scrollLeft;
            if (Math.abs(diff) < 0.5) {
                node.scrollLeft = targetRef.current;
                rafRef.current = null;
                return;
            }
            node.scrollLeft += diff * 0.2;
            rafRef.current = requestAnimationFrame(step);
        };
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
    }

    useEffect(() => {
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // 선택 케이스(키보드 a/d 포함)가 우측 리스트에서 안 보이면 최소한으로 스크롤해
    // 보이게 한다(nearest). 좌측 고정 카드와 별개로, 리스트 내 현재 위치를 보여준다.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !selectedCaseId) return;
        const card = el.querySelector<HTMLElement>(`[data-case-id="${CSS.escape(selectedCaseId)}"]`);
        if (!card) return;
        const max = el.scrollWidth - el.clientWidth;
        const left = card.offsetLeft;
        const right = left + card.offsetWidth;
        const viewLeft = el.scrollLeft;
        const viewRight = viewLeft + el.clientWidth;
        let target = viewLeft;
        if (left < viewLeft + 14) target = left - 14;
        else if (right > viewRight - 14) target = right - el.clientWidth + 14;
        else return; // 이미 보이면 그대로.
        targetRef.current = Math.max(0, Math.min(max, target));
        el.scrollTo({ left: targetRef.current, behavior: "smooth" });
    }, [selectedCaseId, cases]);

    const isEmpty = cases.length === 0;

    return (
        <div className={styles.rail}>
            {selectedCase ? (
                <>
                    <div className={styles.pinned}>
                        <CaseCard
                            c={selectedCase}
                            selected
                            linkedCount={linkedCountByCase.get(selectedCase.caseId) ?? 0}
                            onSelect={() => selectCase(selectedCase.caseId)}
                            onSetOutcome={(o) => onSetOutcome(selectedCase.caseId, o)}
                            onSetNote={(n) => onSetNote(selectedCase.caseId, n)}
                        />
                    </div>
                    <div className={styles.divider} />
                </>
            ) : isEmpty ? (
                <>
                    <div className={styles.pinned}>
                        <div className={styles.mockWrap}>
                            <span className={styles.mockTag}>예시 · mock</span>
                            <div className={styles.mockCard}>
                                <CaseCard
                                    c={MOCK_CASE}
                                    selected={false}
                                    linkedCount={2}
                                    onSelect={noop}
                                    onSetOutcome={noop}
                                    onSetNote={noop}
                                />
                            </div>
                        </div>
                    </div>
                    <div className={styles.divider} />
                </>
            ) : null}
            <div className={styles.scroll} ref={scrollRef} onWheel={onWheel}>
                {isEmpty && (
                    <span className={styles.muted}>
                        {loading
                            ? "케이스 불러오는 중…"
                            : "이 조건에 해당하는 케이스가 없어요. 왼쪽은 예시 카드입니다."}
                    </span>
                )}
                {cases.map((c) => (
                    <CaseCard
                        key={c.caseId}
                        c={c}
                        selected={c.caseId === selectedCaseId}
                        linkedCount={linkedCountByCase.get(c.caseId) ?? 0}
                        onSelect={() => selectCase(c.caseId)}
                        onSetOutcome={(o) => onSetOutcome(c.caseId, o)}
                        onSetNote={(n) => onSetNote(c.caseId, n)}
                    />
                ))}
            </div>
        </div>
    );
}
