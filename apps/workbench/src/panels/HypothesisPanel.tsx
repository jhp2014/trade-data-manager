import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hypothesesForPoint } from "@trade-data-manager/market";
import { useWorkbench } from "../store/workbench.js";
import {
    fetchHypotheses,
    fetchHypothesisLinks,
    createHypothesis,
    linkHypothesis,
    unlinkHypothesis,
    deleteHypothesis,
} from "../api/hypotheses.js";

// 가설 패널 — 얇은 단일 목록. 각 행 한 줄: `H{id} : 텍스트`(코드는 나중 필터링/그래프용). 체크박스 없음 —
// 연결/해제·삭제는 hover 아이콘, 현재 타점 연결은 좌측 accent 바로 표시. 행 클릭=선택→연결 타점 이동.
// 조립·필터는 클라 인메모리(옵션 A): 가설·링크 두 목록을 RQ 캐시로 받아 여기서 계산.
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
    const hypotheses = useMemo(() => hypQ.data ?? [], [hypQ.data]);
    const links = useMemo(() => linkQ.data ?? [], [linkQ.data]);

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
    // 현재 타점에 연결된 가설을 위로. 타점 없으면 원순서.
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
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", fontSize: 13, color: "var(--text-primary)" }}>
            {/* 헤더 — 현재 타점 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ fontWeight: 700 }}>가설</span>
                {point ? (
                    <span className="tabular" style={{ color: "var(--text-secondary)" }}>{point.stockCode} · {point.date} · {point.time}</span>
                ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>분봉에서 타점(시각)을 선택</span>
                )}
            </div>

            {/* 가설 추가 입력 — 필드 안에 버튼 embed(유지). */}
            <div style={{ padding: 10, borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden", background: "var(--bg-primary)" }}>
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addHypothesis()}
                        placeholder={point ? "새 가설 입력 후 Enter (이 타점에 연결)" : "새 가설 입력 후 Enter"}
                        style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "var(--text-primary)", padding: "7px 9px", font: "inherit", fontSize: 12, outline: "none" }}
                    />
                    <button
                        onClick={addHypothesis}
                        disabled={!text.trim() || createMut.isPending}
                        title={point ? "추가 후 이 타점에 연결" : "가설 추가"}
                        style={{ flexShrink: 0, width: 36, border: 0, borderLeft: "1px solid var(--border-default)", background: "var(--accent-soft)", color: "var(--accent-hover)", cursor: "pointer", fontSize: 16, fontWeight: 600 }}
                    >
                        ＋
                    </button>
                </div>
            </div>

            {/* 목록 — 얇은 단일 행 `H{id} : 텍스트` */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 6px", display: "flex", flexDirection: "column", gap: 1 }}>
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
                                    alignItems: "baseline",
                                    gap: 6,
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    background: selected ? "var(--accent-soft)" : hovered ? "var(--bg-secondary)" : "transparent",
                                    boxShadow: linked ? "inset 3px 0 0 0 var(--accent-primary)" : undefined,
                                    cursor: "pointer",
                                    lineHeight: 1.4,
                                }}
                            >
                                <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, fontWeight: 700, color: "var(--accent-hover)", flexShrink: 0 }}>H{h.id}</code>
                                <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>:</span>
                                <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word", fontWeight: linked ? 600 : 400 }}>{h.text}</span>

                                {/* 우측 클러스터 — 연결수(항상) + hover 액션(연결 토글·삭제) */}
                                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, alignSelf: "center" }}>
                                    {cnt > 0 && <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 10, textAlign: "right" }}>{cnt}</span>}
                                    {point && (
                                        <IconBtn
                                            title={linked ? "이 타점에서 연결 해제" : "이 타점에 연결"}
                                            color={linked ? "var(--accent-hover)" : "var(--text-tertiary)"}
                                            visible={hovered || linked}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (linked) unlinkMut.mutate({ hypothesisId: h.id, ...point });
                                                else linkMut.mutate({ hypothesisId: h.id, ...point });
                                            }}
                                        >
                                            {linked ? "✓" : "＋"}
                                        </IconBtn>
                                    )}
                                    <IconBtn
                                        title="가설 삭제"
                                        color="var(--rise)"
                                        visible={hovered}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`H${h.id} 가설을 삭제할까요? 연결·관계도 함께 제거됩니다.`)) deleteMut.mutate(h.id);
                                        }}
                                    >
                                        ×
                                    </IconBtn>
                                </span>
                            </div>

                            {selected && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "3px 0 6px 24px" }}>
                                    {selectedPoints.length === 0 && <div style={mutedStyle}>연결된 타점 없음</div>}
                                    {selectedPoints.map((l, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setFocus({ date: l.date, code: l.stockCode, time: l.time })}
                                            className="tabular"
                                            style={{ textAlign: "left", padding: "2px 6px", borderRadius: 4, background: "none", border: "none", color: "var(--accent-hover)", cursor: "pointer", fontSize: 12 }}
                                            title="이 타점으로 이동"
                                        >
                                            {l.stockCode} · {l.date} · {l.time}
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

const mutedStyle: React.CSSProperties = { color: "var(--text-tertiary)", fontSize: 12, padding: "4px 2px" };

// 우측 hover 액션 아이콘 — 기본 숨김(opacity 0), hover/활성 시 노출. 레이아웃 시프트 방지 위해 자리 유지.
function IconBtn({
    children,
    onClick,
    title,
    color,
    visible,
}: {
    children: React.ReactNode;
    onClick: (e: React.MouseEvent) => void;
    title: string;
    color: string;
    visible: boolean;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: 16,
                height: 16,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: 0,
                background: "transparent",
                color,
                fontSize: 13,
                lineHeight: 1,
                cursor: "pointer",
                opacity: visible ? 0.9 : 0,
                transition: "opacity 0.12s ease",
            }}
        >
            {children}
        </button>
    );
}
