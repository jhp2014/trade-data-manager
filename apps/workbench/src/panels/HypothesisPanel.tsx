import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { filterMembership } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import type { Hypothesis } from "../api/hypotheses.js";
import { createHypothesis, updateHypothesis, linkHypothesis, unlinkHypothesis, deleteHypothesis } from "../api/hypotheses.js";
import { hypothesesQuery, hypothesisLinksQuery, allPointsQuery } from "../api/queries.js";
import { useHypothesisData } from "../lib/useHypothesisData.js";

// 가설 패널 — 얇은 목록. ID 는 안 보인다(필터를 UI 로 만들므로 타이핑 불필요). 3상태 인코딩(그래프와 공통):
//   (A) 현재 타점 연결 = 좌측 직각 바 + 상단 정렬  ·  (B) 필터 포함 = 우측 칩(제외=빨강)  ·  (C) 선택 = 행 배경.
// 우클릭 = 필터에 추가(양성→제외→해제 순환). 선택 시 연결 타점(종목명) 펼침→이동. 필터/그래프는 클라 인메모리.
export function HypothesisPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const selectedId = useWorkbench((s) => s.selectedHypothesisId);
    const setSelectedHypothesis = useWorkbench((s) => s.setSelectedHypothesis);
    const filterDraft = useWorkbench((s) => s.filterDraft);
    const addFilterLeaf = useWorkbench((s) => s.addFilterLeaf);
    const membership = useMemo(() => filterMembership(filterDraft), [filterDraft]);
    const qc = useQueryClient();

    const { hypotheses, links, isLoading, point, linkedToPoint: linkedIds, countByHyp } = useHypothesisData();
    const pointsQ = useQuery(allPointsQuery());
    const nameByCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return m;
    }, [pointsQ.data]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: hypothesesQuery().queryKey });
        void qc.invalidateQueries({ queryKey: hypothesisLinksQuery().queryKey });
    };

    const ordered = useMemo(() => {
        if (!point) return hypotheses;
        return [...hypotheses].sort((a, b) => Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id)));
    }, [hypotheses, linkedIds, point]);

    const [text, setText] = useState("");
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // 선택 축(selectedHypothesisId)은 그래프와 공유 → 그래프에서 선택 시 이 목록이 해당 가설로 스크롤(연결 종목이 펼쳐지므로).
    // block:"nearest" 라 이미 보이면 안 움직임 → 목록 내부 클릭엔 부작용 없음(별도 origin 태그 불필요).
    const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (selectedId) rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selectedId]);
    const selectedPoints = useMemo(
        () => (selectedId ? links.filter((l) => l.hypothesisId === selectedId) : []),
        [links, selectedId],
    );

    // 인라인 텍스트 편집 — 연필 버튼 또는 텍스트 더블클릭으로 진입. 저장/취소는 blur 한 곳으로 모은다.
    // Enter=blur→저장, Esc=escapingRef 세우고 blur→취소. Enter/blur 이중 발화를 blur 단일화로 회피.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const escapingRef = useRef(false);

    const startEdit = (h: Hypothesis): void => {
        setEditingId(h.id);
        setEditText(h.text);
    };
    const commitEdit = (h: Hypothesis): void => {
        const t = editText.trim();
        setEditingId(null);
        if (t && t !== h.text) updateMut.mutate({ id: h.id, text: t });
    };

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
    const updateMut = useMutation({ mutationFn: (v: { id: string; text: string }) => updateHypothesis(v.id, v.text), onSuccess: invalidate });
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
                {isLoading && <div style={mutedStyle}>불러오는 중…</div>}
                {!isLoading && hypotheses.length === 0 && <div style={mutedStyle}>아직 가설이 없습니다</div>}
                {ordered.map((h) => {
                    const linked = linkedIds.has(h.id);
                    const cnt = countByHyp.get(h.id) ?? 0;
                    const selected = selectedId === h.id;
                    const hovered = hoveredId === h.id;
                    const mem = membership.get(h.id);
                    const negOnly = mem ? mem.neg && !mem.pos : false;
                    const editing = editingId === h.id;
                    return (
                        <div
                            key={h.id}
                            ref={(el) => {
                                if (el) rowRefs.current.set(h.id, el);
                                else rowRefs.current.delete(h.id);
                            }}
                        >
                            <div
                                onClick={() => { if (!editing) setSelectedHypothesis(selected ? null : h.id); }}
                                onContextMenu={(e) => { e.preventDefault(); addFilterLeaf(h.id); }}
                                onMouseEnter={() => setHoveredId(h.id)}
                                onMouseLeave={() => setHoveredId((cur) => (cur === h.id ? null : cur))}
                                title="우클릭 = 필터에 추가(포함→제외→해제)"
                                style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 9,
                                    padding: "7px 10px",
                                    background: selected ? "var(--accent-soft)" : hovered ? "var(--bg-secondary)" : "transparent",
                                    cursor: "pointer",
                                }}
                            >
                                {/* (A) 현재 타점 연결 = 텍스트를 accent 색+굵게(좌측 바보다 눈에 띔). 상단 정렬과 함께.
                                    편집 중이면 인라인 input(더블클릭·연필로 진입). Enter=blur→저장 / Esc=취소 / 바깥클릭=저장. */}
                                {editing ? (
                                    <input
                                        autoFocus
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                                            else if (e.key === "Escape") { e.preventDefault(); escapingRef.current = true; e.currentTarget.blur(); }
                                        }}
                                        onBlur={() => { if (escapingRef.current) { escapingRef.current = false; setEditingId(null); } else commitEdit(h); }}
                                        style={{ flex: 1, minWidth: 0, border: "1px solid var(--accent-primary)", borderRadius: 2, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "3px 6px", font: "inherit", fontSize: 13, lineHeight: 1.5, outline: "none" }}
                                    />
                                ) : (
                                    <span
                                        onDoubleClick={(e) => { e.stopPropagation(); startEdit(h); }}
                                        title="더블클릭 = 텍스트 수정"
                                        style={{ flex: 1, minWidth: 0, wordBreak: "break-word", fontSize: 13, lineHeight: 1.5 }}
                                    >
                                        {/* (A) 현재 타점 연결 = accent 글자+굵게 + 테마보드식 글자 형광(accent-soft). 글자를 감싸는 안쪽 span(행 전체 아님). */}
                                        <span
                                            style={{
                                                color: linked ? "var(--accent-primary)" : "var(--text-secondary)",
                                                fontWeight: linked ? 600 : 400,
                                                ...(linked ? { background: "var(--accent-soft)", borderRadius: 3, padding: "1px 4px", margin: "0 -2px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" } : null),
                                            }}
                                        >
                                            {h.text}
                                        </span>
                                    </span>
                                )}

                                {/* 우측 — (B)필터 칩 + 연결수 + hover 액션. 편집 중엔 숨김(input 이 폭 차지). */}
                                {!editing && (
                                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, height: 18, marginTop: 0 }}>
                                    {mem && (
                                        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, lineHeight: "15px", height: 15, padding: "0 6px", borderRadius: 10, background: negOnly ? "rgba(239,68,68,0.12)" : "var(--accent-soft)", color: negOnly ? "var(--rise)" : "var(--accent-primary)" }}>
                                            {negOnly ? "제외" : "필터"}
                                        </span>
                                    )}
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
                                        title="가설 텍스트 수정"
                                        visible={hovered}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startEdit(h);
                                        }}
                                    >
                                        <PencilIcon />
                                    </ActionBtn>
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
                                )}
                            </div>

                            {/* 선택 시 — 연결된 타점(종목명) 펼침 → 클릭 이동 */}
                            {selected && (
                                <div style={{ display: "flex", flexDirection: "column", padding: "1px 0 6px 45px", background: "var(--accent-soft)" }}>
                                    {selectedPoints.length === 0 && <div style={{ ...mutedStyle, paddingLeft: 0 }}>연결된 타점 없음</div>}
                                    {selectedPoints.map((l, i) => (
                                        <button
                                            key={i}
                                            onClick={() => goToPoint({ date: l.date, code: l.stockCode, time: l.time })}
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
function PencilIcon(): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
