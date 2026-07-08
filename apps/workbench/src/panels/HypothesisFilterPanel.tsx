import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { unknownFilterIds } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { hypothesesQuery, hypothesisFiltersQuery } from "../api/queries.js";
import { saveHypothesisFilter, deleteHypothesisFilter } from "../api/hypothesisFilters.js";

// 가설 필터 패널 — DNF 블럭 빌더(AND 그룹들의 OR) + 아이콘 툴바(저장/불러오기/새로고침/방향).
// 팔레트(가설 고르기)는 이 패널이 안 가짐 — 가설 목록/그래프에서 우클릭 → addFilterLeaf 로 채운다(중복 제거).
// 방향 = DNF 그리드의 전치: 세로(OR↓·AND→wrap) ↔ 가로(OR→·AND↓). 데이터 모델 동일, flex-direction 만 뒤집힘.
// 결과 타점 리스트·집계·outcome 패싯은 작업셋(필터 활성 시)이 담당.

type Orientation = "vertical" | "horizontal";
const ORIENT_KEY = "wb.hypFilterOrientation";
function loadOrientation(): Orientation {
    try {
        return localStorage.getItem(ORIENT_KEY) === "horizontal" ? "horizontal" : "vertical";
    } catch {
        return "vertical";
    }
}

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
    const [saveOpen, setSaveOpen] = useState(false);
    const [loadOpen, setLoadOpen] = useState(false);
    const [orientation, setOrientation] = useState<Orientation>(loadOrientation);
    const horizontal = orientation === "horizontal";

    const invalidate = (): void => void qc.invalidateQueries({ queryKey: hypothesisFiltersQuery().queryKey });
    const saveMut = useMutation({ mutationFn: () => saveHypothesisFilter(name.trim(), draft), onSuccess: invalidate });
    const delMut = useMutation({ mutationFn: deleteHypothesisFilter, onSuccess: invalidate });

    const doSave = (): void => {
        if (name.trim() && active) {
            saveMut.mutate();
            setSaveOpen(false);
        }
    };
    const doLoad = (id: string): void => {
        const f = saved.find((x) => x.id === id);
        if (f) {
            setFilterExpr(f.expr);
            setName(f.name);
        }
        setLoadOpen(false);
    };
    const doReset = (): void => {
        if (active && confirm("현재 필터를 지울까요?")) clearFilter();
    };
    const toggleOrientation = (): void =>
        setOrientation((o) => {
            const next: Orientation = o === "vertical" ? "horizontal" : "vertical";
            try {
                localStorage.setItem(ORIENT_KEY, next);
            } catch {
                /* noop */
            }
            return next;
        });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            {/* 아이콘 툴바 — 저장(팝오버)·불러오기(팝오버)·새로고침(지우기)·방향(가로/세로). 이름 입력은 저장 팝오버 안으로. */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "5px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
                    {/* 저장 */}
                    <div style={{ position: "relative" }}>
                        <IconBtn onClick={() => setSaveOpen((v) => !v)} disabled={!active} active={saveOpen} title="필터 저장"><SaveIcon /></IconBtn>
                        {saveOpen && (
                            <>
                                <div onClick={() => setSaveOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                                <div style={{ ...menuStyle, padding: 8, width: 220 }}>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <input
                                            autoFocus
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && doSave()}
                                            placeholder="필터 이름"
                                            style={{ flex: 1, minWidth: 0, border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "5px 8px", font: "inherit", fontSize: 12.5, outline: "none" }}
                                        />
                                        <button onClick={doSave} disabled={!name.trim() || saveMut.isPending} style={{ flexShrink: 0, border: "1px solid var(--accent-primary)", borderRadius: 4, background: "var(--accent-primary)", color: "#fff", padding: "5px 10px", cursor: name.trim() ? "pointer" : "default", font: "inherit", fontSize: 12, opacity: name.trim() ? 1 : 0.5 }}>저장</button>
                                    </div>
                                    <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--text-tertiary)" }}>같은 이름이면 덮어씀</div>
                                </div>
                            </>
                        )}
                    </div>
                    {/* 불러오기 */}
                    <div style={{ position: "relative" }}>
                        <IconBtn onClick={() => setLoadOpen((v) => !v)} disabled={saved.length === 0} active={loadOpen} title="저장된 필터 불러오기"><FolderIcon /></IconBtn>
                        {loadOpen && (
                            <>
                                <div onClick={() => setLoadOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                                <div style={{ ...menuStyle, minWidth: 180, maxHeight: 300, overflowY: "auto" }}>
                                    {saved.map((f) => (
                                        <div key={f.id} style={{ display: "flex", alignItems: "center" }}>
                                            <button onClick={() => doLoad(f.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", padding: "6px 10px", cursor: "pointer", font: "inherit", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</button>
                                            <button onClick={() => delMut.mutate(f.id)} title="저장 필터 삭제" style={{ flexShrink: 0, width: 26, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14 }}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    {/* 새로고침(지우기) */}
                    <IconBtn onClick={doReset} disabled={!active} title="필터 새로고침(지우기)"><RefreshIcon /></IconBtn>
                    <span style={{ width: 1, height: 16, background: "var(--border-subtle)", margin: "0 3px" }} />
                    {/* 방향 전환 */}
                    <IconBtn onClick={toggleOrientation} title={`필터 방향: ${horizontal ? "가로" : "세로"} (클릭하면 ${horizontal ? "세로" : "가로"})`}>
                        {horizontal ? <ColumnsIcon /> : <RowsIcon />}
                    </IconBtn>
                </div>
            </div>

            {/* 빌더 본문 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: horizontal ? "auto" : "hidden", padding: 10 }}>
                {!active && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.7, padding: "6px 2px" }}>
                        가설 목록 / 그래프에서 <b style={{ color: "var(--text-secondary)" }}>우클릭 → 필터에 추가</b>로 조건을 만드세요.
                        <br />한 그룹 안은 <b style={{ color: "var(--text-secondary)" }}>AND</b>, 그룹끼리는 <b style={{ color: "var(--text-secondary)" }}>OR</b>. 칩을 클릭하면 제외(NOT).
                    </div>
                )}

                <div style={{ display: "flex", flexDirection: horizontal ? "row" : "column", alignItems: horizontal ? "flex-start" : "stretch", gap: 8 }}>
                    {draft.groups.map((g, gi) => (
                        <Fragment key={gi}>
                            {gi > 0 && <OrDivider horizontal={horizontal} />}
                            <div style={{ position: "relative", border: "1px solid var(--border-default)", borderRadius: 6, padding: "8px 8px", background: "var(--bg-secondary)", minWidth: horizontal ? 130 : undefined }}>
                                <div style={{ display: "flex", flexDirection: horizontal ? "column" : "row", flexWrap: horizontal ? "nowrap" : "wrap", gap: 6, paddingRight: 18 }}>
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
                                                    // 노션 인라인 코드 스타일 — 각진 코드박스(연한 배경·작은 라운드), 폰트는 기본.
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
                        </Fragment>
                    ))}

                    {active && (
                        <button
                            onClick={addGroup}
                            title="또는(OR) 그룹 추가"
                            style={{
                                border: "1px dashed var(--border-default)",
                                borderRadius: 6,
                                background: "transparent",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                font: "inherit",
                                fontSize: 12.5,
                                ...(horizontal ? { minWidth: 40, alignSelf: "stretch", padding: "6px 4px" } : { width: "100%", padding: "6px 8px" }),
                            }}
                        >{horizontal ? "＋" : "＋ 또는(OR) 그룹"}</button>
                    )}
                </div>

                {unknown.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--rise)" }}>
                        삭제된 가설 {unknown.length}개 참조 — 저장 필터를 정리하세요.
                    </div>
                )}
            </div>
        </div>
    );
}

const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 4,
    zIndex: 41,
    background: "var(--bg-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};

// "또는" 구분선 — 방향에 따라 전치(세로 컨테이너=가로선 / 가로 컨테이너=세로선).
function OrDivider({ horizontal }: { horizontal: boolean }): JSX.Element {
    if (horizontal) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, alignSelf: "stretch", padding: "2px 0" }}>
                <span style={{ flex: 1, width: 1, background: "var(--border-subtle)" }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>또는</span>
                <span style={{ flex: 1, width: 1, background: "var(--border-subtle)" }} />
            </div>
        );
    }
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>또는</span>
            <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
        </div>
    );
}

function IconBtn({ children, onClick, title, disabled, active }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; active?: boolean }): JSX.Element {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 26,
                border: "1px solid transparent",
                borderRadius: 5,
                background: active ? "var(--accent-soft)" : "transparent",
                color: disabled ? "var(--text-tertiary)" : active ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.45 : 1,
            }}
        >
            {children}
        </button>
    );
}

function SaveIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
        </svg>
    );
}
function FolderIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    );
}
function RefreshIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
    );
}
// 세로 모드 표시 — 가로 막대 3개 쌓임(행). 가로 모드 표시 — 세로 막대 3개(열).
function RowsIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <rect x="3" y="10" width="18" height="4" rx="1" />
            <rect x="3" y="16" width="18" height="4" rx="1" />
        </svg>
    );
}
function ColumnsIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="3" width="4" height="18" rx="1" />
            <rect x="10" y="3" width="4" height="18" rx="1" />
            <rect x="16" y="3" width="4" height="18" rx="1" />
        </svg>
    );
}
