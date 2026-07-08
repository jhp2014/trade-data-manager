import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { unknownFilterIds } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { hypothesesQuery, hypothesisFiltersQuery } from "../api/queries.js";
import { saveHypothesisFilter, deleteHypothesisFilter } from "../api/hypothesisFilters.js";

// 가설 필터 패널 — DNF 블럭 빌더(AND 그룹들의 OR) + 저장/불러오기.
// 팔레트(가설 고르기)는 이 패널이 안 가짐 — 가설 목록/그래프에서 우클릭 → addFilterLeaf 로 채운다(중복 제거).
// 여기선 만들어진 식(칩)과 저장/불러오기만. 결과 타점 리스트·집계·outcome 패싯은 작업셋(필터 활성 시)이 담당.
export function HypothesisFilterPanel(): JSX.Element {
    const draft = useWorkbench((s) => s.filterDraft);
    const addGroup = useWorkbench((s) => s.addFilterGroup);
    const removeLeaf = useWorkbench((s) => s.removeFilterLeaf);
    const toggleNegate = useWorkbench((s) => s.toggleFilterNegate);
    const removeGroup = useWorkbench((s) => s.removeFilterGroup);
    const clearFilter = useWorkbench((s) => s.clearFilter);
    const setFilterExpr = useWorkbench((s) => s.setFilterExpr);
    const qc = useQueryClient();

    const hypQ = useQuery(hypothesesQuery());
    const textById = useMemo(() => new Map((hypQ.data ?? []).map((h) => [h.id, h.text])), [hypQ.data]);
    const filtersQ = useQuery(hypothesisFiltersQuery());
    const saved = useMemo(() => filtersQ.data ?? [], [filtersQ.data]);

    const unknown = useMemo(() => unknownFilterIds(draft, [...textById.keys()]), [draft, textById]);
    const active = draft.groups.some((g) => g.length > 0);

    const [name, setName] = useState("");
    const [loadOpen, setLoadOpen] = useState(false);
    const invalidate = (): void => void qc.invalidateQueries({ queryKey: hypothesisFiltersQuery().queryKey });
    const saveMut = useMutation({ mutationFn: () => saveHypothesisFilter(name.trim(), draft), onSuccess: invalidate });
    const delMut = useMutation({ mutationFn: deleteHypothesisFilter, onSuccess: invalidate });

    const doLoad = (id: string): void => {
        const f = saved.find((x) => x.id === id);
        if (f) {
            setFilterExpr(f.expr);
            setName(f.name);
        }
        setLoadOpen(false);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            {/* 저장/불러오기 바 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && name.trim() && active && saveMut.mutate()}
                    placeholder="필터 이름"
                    style={{ flex: 1, minWidth: 0, border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "5px 8px", font: "inherit", fontSize: 12.5, outline: "none" }}
                />
                <BarBtn onClick={() => saveMut.mutate()} disabled={!name.trim() || !active || saveMut.isPending} title="현재 식을 이 이름으로 저장(같은 이름이면 덮어씀)">저장</BarBtn>
                <div style={{ position: "relative" }}>
                    <BarBtn onClick={() => setLoadOpen((v) => !v)} disabled={saved.length === 0} title="저장된 필터 불러오기">불러오기</BarBtn>
                    {loadOpen && (
                        <>
                            <div onClick={() => setLoadOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 41, minWidth: 180, maxHeight: 280, overflowY: "auto", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                                {saved.map((f) => (
                                    <div key={f.id} style={{ display: "flex", alignItems: "center" }}>
                                        <button onClick={() => doLoad(f.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", padding: "6px 10px", cursor: "pointer", font: "inherit", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {f.name}
                                        </button>
                                        <button onClick={() => delMut.mutate(f.id)} title="저장 필터 삭제" style={{ flexShrink: 0, width: 26, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14 }}>×</button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                <BarBtn onClick={clearFilter} disabled={!active} title="필터 지우기">지우기</BarBtn>
            </div>

            {/* 빌더 본문 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
                {!active && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.7, padding: "6px 2px" }}>
                        가설 목록 / 그래프에서 <b style={{ color: "var(--text-secondary)" }}>우클릭 → 필터에 추가</b>로 조건을 만드세요.
                        <br />한 그룹 안은 <b style={{ color: "var(--text-secondary)" }}>AND</b>, 그룹끼리는 <b style={{ color: "var(--text-secondary)" }}>OR</b>. 칩을 클릭하면 제외(NOT).
                    </div>
                )}

                {draft.groups.map((g, gi) => (
                    <div key={gi}>
                        {gi > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>또는</span>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                            </div>
                        )}
                        <div style={{ position: "relative", border: "1px solid var(--border-default)", borderRadius: 6, padding: "8px 8px 8px", background: "var(--bg-secondary)" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingRight: 18 }}>
                                {g.length === 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>비어 있음</span>}
                                {g.map((l) => {
                                    const isUnknown = !textById.has(l.hypothesisId);
                                    const label = textById.get(l.hypothesisId) ?? `삭제된 가설(${l.hypothesisId})`;
                                    return (
                                        <span
                                            key={l.hypothesisId}
                                            onClick={() => toggleNegate(gi, l.hypothesisId)}
                                            title={l.negated ? "제외(NOT) — 클릭하면 포함" : "포함 — 클릭하면 제외(NOT)"}
                                            style={{
                                                // 노션 인라인 코드 스타일 — 둥근 pill 아님, 각진 코드박스(연한 배경·작은 라운드). 폰트는 기본(한글엔 모노 어색).
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 3,
                                                maxWidth: 220,
                                                cursor: "pointer",
                                                fontSize: 12,
                                                lineHeight: "18px",
                                                padding: "1px 6px",
                                                borderRadius: 4,
                                                background: l.negated ? "rgba(239,68,68,0.12)" : "var(--bg-tertiary)",
                                                color: l.negated ? "var(--rise)" : isUnknown ? "var(--text-tertiary)" : "var(--text-primary)",
                                            }}
                                        >
                                            {l.negated && <span style={{ fontWeight: 700 }}>!</span>}
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeLeaf(gi, l.hypothesisId); }}
                                                title="이 조건 제거"
                                                style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, marginLeft: 1, fontSize: 13, lineHeight: 1, opacity: 0.55 }}
                                            >×</button>
                                        </span>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => removeGroup(gi)}
                                title="그룹 삭제"
                                style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                            >×</button>
                        </div>
                    </div>
                ))}

                {active && (
                    <button
                        onClick={addGroup}
                        style={{ marginTop: 10, width: "100%", border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "6px 8px", cursor: "pointer", font: "inherit", fontSize: 12.5 }}
                    >＋ 또는(OR) 그룹</button>
                )}

                {unknown.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--rise)" }}>
                        삭제된 가설 {unknown.length}개 참조 — 저장 필터를 정리하세요.
                    </div>
                )}
            </div>
        </div>
    );
}

function BarBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }): JSX.Element {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                flexShrink: 0,
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                background: "var(--bg-primary)",
                color: disabled ? "var(--text-tertiary)" : "var(--text-primary)",
                padding: "5px 9px",
                cursor: disabled ? "default" : "pointer",
                font: "inherit",
                fontSize: 12,
                opacity: disabled ? 0.55 : 1,
            }}
        >
            {children}
        </button>
    );
}
