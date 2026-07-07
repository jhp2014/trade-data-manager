import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hypothesesForPoint } from "@trade-data-manager/market";
import { useWorkbench } from "../store/workbench.js";
import { fetchAllPoints } from "../api/reviewPoints.js";
import {
    fetchHypotheses,
    fetchHypothesisLinks,
    createHypothesis,
    linkHypothesis,
    unlinkHypothesis,
    deleteHypothesis,
} from "../api/hypotheses.js";

// 가설 패널 — 얇은 목록. 각 행: [H{id} 태그] 텍스트, 우측 hover 액션(연결 토글·삭제).
// 현재 타점 연결 = 태그 채움(테두리 없음). 선택 = 행 배경. 선택 시 연결 타점(종목명) 펼침→이동.
// 타이포는 Pretendard 단일 폰트(코드도 tabular sans) — dockview 플랫·각진 톤. 필터/그래프는 클라 인메모리.
export function HypothesisPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const time = useWorkbench((s) => s.focus.time);
    const setFocus = useWorkbench((s) => s.setFocus);
    const selectedId = useWorkbench((s) => s.selectedHypothesisId);
    const setSelectedHypothesis = useWorkbench((s) => s.setSelectedHypothesis);
    const qc = useQueryClient();

    const hypQ = useQuery({ queryKey: ["hypotheses"], queryFn: fetchHypotheses, staleTime: Infinity });
    const linkQ = useQuery({ queryKey: ["hypothesis-links"], queryFn: fetchHypothesisLinks, staleTime: Infinity });
    const pointsQ = useQuery({ queryKey: ["all-points"], queryFn: fetchAllPoints, staleTime: Infinity });
    const hypotheses = useMemo(() => hypQ.data ?? [], [hypQ.data]);
    const links = useMemo(() => linkQ.data ?? [], [linkQ.data]);
    const nameByCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return m;
    }, [pointsQ.data]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: ["hypotheses"] });
        void qc.invalidateQueries({ queryKey: ["hypothesis-links"] });
    };

    const point = code && date && time ? { stockCode: code, date, time } : null;
    const linkedIds = useMemo(() => (point ? hypothesesForPoint(links, point) : new Set<string>()), [links, point]);
    const countByHyp = useMemo(() => {
        const m = new Map<string, number>();
        for (const l of links) m.set(l.hypothesisId, (m.get(l.hypothesisId) ?? 0) + 1);
        return m;
    }, [links]);
    const ordered = useMemo(() => {
        if (!point) return hypotheses;
        return [...hypotheses].sort((a, b) => Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id)));
    }, [hypotheses, linkedIds, point]);

    const [text, setText] = useState("");
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const selectedPoints = useMemo(
        () => (selectedId ? links.filter((l) => l.hypothesisId === selectedId) : []),
        [links, selectedId],
    );

    const createMut = useMutation({
        mutationFn: async (t: string) => {
            const h = await createHypothesis(t);
            if (point) await linkHypothesis({ hypothesisId: h.id, ...point });
        },
        onSuccess: () => {
            setText("");
            invalidate();
        },
    });
    const linkMut = useMutation({ mutationFn: linkHypothesis, onSuccess: invalidate });
    const unlinkMut = useMutation({ mutationFn: unlinkHypothesis, onSuccess: invalidate });
    const deleteMut = useMutation({ mutationFn: deleteHypothesis, onSuccess: invalidate });

    const addHypothesis = (): void => {
        const t = text.trim();
        if (t) createMut.mutate(t);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
            {/* 가설 추가 입력 */}
            <div style={{ padding: 8, borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border-default)", borderRadius: 2, overflow: "hidden", background: "var(--bg-primary)" }}>
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addHypothesis()}
                        placeholder={point ? "새 가설 입력 후 Enter · 이 타점에 연결" : "새 가설 입력 후 Enter"}
                        style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "var(--text-primary)", padding: "6px 9px", font: "inherit", fontSize: 13, outline: "none" }}
                    />
                    <button
                        onClick={addHypothesis}
                        disabled={!text.trim() || createMut.isPending}
                        title={point ? "추가 후 이 타점에 연결" : "가설 추가"}
                        style={{ flexShrink: 0, width: 34, border: 0, borderLeft: "1px solid var(--border-default)", background: "var(--accent-soft)", color: "var(--accent-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                        <PlusIcon />
                    </button>
                </div>
            </div>

            {/* 목록 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 8px" }}>
                {hypQ.isLoading && <div style={mutedStyle}>불러오는 중…</div>}
                {!hypQ.isLoading && hypotheses.length === 0 && <div style={mutedStyle}>아직 가설이 없습니다</div>}
                {ordered.map((h) => {
                    const linked = linkedIds.has(h.id);
                    const cnt = countByHyp.get(h.id) ?? 0;
                    const selected = selectedId === h.id;
                    const hovered = hoveredId === h.id;
                    return (
                        <div key={h.id}>
                            <div
                                onClick={() => setSelectedHypothesis(selected ? null : h.id)}
                                onMouseEnter={() => setHoveredId(h.id)}
                                onMouseLeave={() => setHoveredId((cur) => (cur === h.id ? null : cur))}
                                style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 9,
                                    padding: "7px 10px",
                                    background: selected ? "var(--accent-soft)" : hovered ? "var(--bg-secondary)" : "transparent",
                                    cursor: "pointer",
                                }}
                            >
                                {/* 코드 태그 — 연결 시 채움. tabular sans(H+숫자 정렬). */}
                                <span
                                    className="tabular"
                                    style={{
                                        flexShrink: 0,
                                        minWidth: 24,
                                        textAlign: "center",
                                        marginTop: 1,
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        letterSpacing: "0.02em",
                                        lineHeight: "16px",
                                        height: 16,
                                        padding: "0 5px",
                                        borderRadius: 2,
                                        background: linked ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                        color: linked ? "#fff" : "var(--text-tertiary)",
                                    }}
                                >
                                    H{h.id}
                                </span>
                                <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word", fontSize: 13, lineHeight: 1.5, color: linked ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: linked ? 500 : 400 }}>{h.text}</span>

                                {/* 우측 — 연결수(있을 때) + hover 액션 */}
                                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 2, height: 18, marginTop: 0 }}>
                                    {cnt > 0 && <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 12, textAlign: "right", marginRight: 2 }}>{cnt}</span>}
                                    {point && (
                                        <ActionBtn
                                            title={linked ? "이 타점에서 연결 해제" : "이 타점에 연결"}
                                            active={linked}
                                            visible={hovered || linked}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (linked) unlinkMut.mutate({ hypothesisId: h.id, ...point });
                                                else linkMut.mutate({ hypothesisId: h.id, ...point });
                                            }}
                                        >
                                            {linked ? <CheckIcon /> : <PlusIcon />}
                                        </ActionBtn>
                                    )}
                                    <ActionBtn
                                        title="가설 삭제"
                                        danger
                                        visible={hovered}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`H${h.id} 가설을 삭제할까요? 연결·관계도 함께 제거됩니다.`)) deleteMut.mutate(h.id);
                                        }}
                                    >
                                        <TrashIcon />
                                    </ActionBtn>
                                </span>
                            </div>

                            {/* 선택 시 — 연결된 타점(종목명) 펼침 → 클릭 이동 */}
                            {selected && (
                                <div style={{ display: "flex", flexDirection: "column", padding: "1px 0 6px 45px", background: "var(--accent-soft)" }}>
                                    {selectedPoints.length === 0 && <div style={{ ...mutedStyle, paddingLeft: 0 }}>연결된 타점 없음</div>}
                                    {selectedPoints.map((l, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setFocus({ date: l.date, code: l.stockCode, time: l.time })}
                                            title="이 타점으로 이동"
                                            style={{ display: "flex", alignItems: "baseline", gap: 7, textAlign: "left", padding: "2px 10px 2px 0", background: "none", border: "none", cursor: "pointer" }}
                                        >
                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{nameByCode.get(l.stockCode) ?? l.stockCode}</span>
                                            <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l.date} · {l.time.slice(0, 5)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const mutedStyle: React.CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "6px 12px" };

// 우측 hover 액션 — 기본 숨김(자리 유지), hover/활성 시 노출. 색: 연결=accent, 삭제=danger.
function ActionBtn({
    children,
    onClick,
    title,
    visible,
    active,
    danger,
}: {
    children: React.ReactNode;
    onClick: (e: React.MouseEvent) => void;
    title: string;
    visible: boolean;
    active?: boolean;
    danger?: boolean;
}): JSX.Element {
    const color = danger ? "var(--rise)" : active ? "var(--accent-primary)" : "var(--text-tertiary)";
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: 0,
                background: "transparent",
                color,
                cursor: "pointer",
                opacity: visible ? 1 : 0,
                transition: "opacity 0.12s ease",
            }}
        >
            {children}
        </button>
    );
}

function PlusIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}
function CheckIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}
function TrashIcon(): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
    );
}
