"use client";

import { useEffect, useRef } from "react";
import type { WorkingSetCase } from "@/services/workingSet";
import { useSelection } from "@/stores/selection";
import { CaseCard } from "./CaseCard";
import styles from "./CaseRail.module.css";

export function CaseRail({
    cases,
    loading,
    linkedCountByCase,
}: {
    cases: WorkingSetCase[];
    loading: boolean;
    linkedCountByCase: Map<string, number>;
}) {
    const selectedCaseId = useSelection((s) => s.selectedCaseId);
    const selectCase = useSelection((s) => s.selectCase);
    const scrollRef = useRef<HTMLDivElement>(null);
    const targetRef = useRef(0);
    const rafRef = useRef<number | null>(null);

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

    // 선택된 케이스(키보드 a/d 포함)를 레일 중앙으로 스크롤.
    // sticky 변형에 영향받지 않도록 offsetLeft(자연 위치) 기준으로 직접 계산한다.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !selectedCaseId) return;
        const card = el.querySelector<HTMLElement>(`[data-case-id="${CSS.escape(selectedCaseId)}"]`);
        if (!card) return;
        const target = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
        const max = el.scrollWidth - el.clientWidth;
        // 진행 중인 휠 이징 목표도 함께 맞춰 충돌을 막는다.
        targetRef.current = Math.max(0, Math.min(max, target));
        el.scrollTo({ left: targetRef.current, behavior: "smooth" });
    }, [selectedCaseId]);

    return (
        <div className={styles.rail}>
            <div className={styles.scroll} ref={scrollRef} onWheel={onWheel}>
                {loading && <span className={styles.muted}>불러오는 중…</span>}
                {!loading && cases.length === 0 && (
                    <span className={styles.muted}>케이스가 없습니다</span>
                )}
                {cases.map((c) => (
                    <CaseCard
                        key={c.caseId}
                        c={c}
                        selected={c.caseId === selectedCaseId}
                        linkedCount={linkedCountByCase.get(c.caseId) ?? 0}
                        onSelect={() => selectCase(c.caseId)}
                    />
                ))}
            </div>
        </div>
    );
}
