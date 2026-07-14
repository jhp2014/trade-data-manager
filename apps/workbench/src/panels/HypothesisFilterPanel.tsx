import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, pointerWithin, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { unknownFilterIds, type FilterLeaf } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { loadJson, saveJson } from "../store/persist.js";
import { hypothesesQuery, hypothesisFiltersQuery } from "../api/queries.js";
import { saveHypothesisFilter, deleteHypothesisFilter } from "../api/hypothesisFilters.js";

// 가설 필터 패널 — 기본 OR 블럭 빌더 + 아이콘 툴바(저장/불러오기/새로고침/방향).
// 팔레트(가설 고르기)는 그래프/목록 우클릭(addFilterLeaf → 새 OR 그룹). 여기선 만든 식 편집·저장.
//   · 기본 OR: 가설마다 별도 그룹(OR). AND = 칩을 다른 그룹으로 **드래그해 합침**. 그룹 밖(＋OR)으로 드래그 = 다시 OR 분리.
//   · 칩 클릭 = 제외(NOT) 토글, × = 제거. 그립(⠿)으로 드래그.
//   · 방향 = DNF 전치(세로 OR↓·AND→ / 가로 OR→·AND↓). 툴바도 연동(세로=상단 가로 / 가로=좌측 세로).
// 결과 타점·집계·outcome 패싯은 작업셋(필터 활성 시)이 담당.

type Orientation = "vertical" | "horizontal";
const ORIENT_KEY = "wb.hypFilterOrientation";
const loadOrientation = (): Orientation => loadJson(ORIENT_KEY, (o) => (o === "horizontal" ? ("horizontal" as const) : null)) ?? "vertical";

export function HypothesisFilterPanel(): JSX.Element {
    const draft = useWorkbench((s) => s.filterDraft);
    const removeLeaf = useWorkbench((s) => s.removeFilterLeaf);
    const toggleNegate = useWorkbench((s) => s.toggleFilterNegate);
    const removeGroup = useWorkbench((s) => s.removeFilterGroup);
    const clearFilter = useWorkbench((s) => s.clearFilter);
    const setFilterExpr = useWorkbench((s) => s.setFilterExpr);
    const moveLeaf = useWorkbench((s) => s.moveLeafToGroup);
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

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const onDragEnd = (e: DragEndEvent): void => {
        if (!e.over) return;
        const [fromStr, hypId] = String(e.active.id).split(":");
        const overId = String(e.over.id);
        let target: number | "new" | null = null;
        if (overId === "new-group") target = "new";
        else if (overId.startsWith("group:")) target = Number(overId.slice(6));
        if (target === "new" || (typeof target === "number" && Number.isFinite(target))) moveLeaf(Number(fromStr), hypId, target);
    };

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
            saveJson(ORIENT_KEY, next);
            return next;
        });

    const menuPos: React.CSSProperties = horizontal ? { top: 0, left: "100%", marginLeft: 4 } : { top: "100%", left: 0, marginTop: 4 };

    return (
        <div style={{ display: "flex", flexDirection: horizontal ? "row" : "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            {/* 아이콘 툴바 — 세로모드=상단 가로 / 가로모드=좌측 세로. */}
            <div
                style={{
                    display: "flex",
                    flexDirection: horizontal ? "column" : "row",
                    alignItems: "center",
                    gap: 2,
                    padding: horizontal ? "8px 5px" : "5px 8px",
                    ...(horizontal ? { borderRight: "1px solid var(--border-default)" } : { borderBottom: "1px solid var(--border-default)" }),
                    background: "var(--bg-secondary)",
                    flexShrink: 0,
                }}
            >
                {/* 저장 */}
                <div style={{ position: "relative" }}>
                    <IconBtn onClick={() => setSaveOpen((v) => !v)} disabled={!active} active={saveOpen} title="필터 저장"><SaveIcon /></IconBtn>
                    {saveOpen && (
                        <>
                            <div onClick={() => setSaveOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                            <div style={{ ...menuBase, ...menuPos, padding: 8, width: 220 }}>
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
                            <div style={{ ...menuBase, ...menuPos, minWidth: 180, maxHeight: 300, overflowY: "auto" }}>
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
                <span style={{ ...(horizontal ? { height: 1, width: 16, margin: "3px 0" } : { width: 1, height: 16, margin: "0 3px" }), background: "var(--border-subtle)" }} />
                {/* 방향 전환 */}
                <IconBtn onClick={toggleOrientation} title={`필터 방향: ${horizontal ? "가로" : "세로"} (클릭하면 ${horizontal ? "세로" : "가로"})`}>
                    {horizontal ? <ColumnsIcon /> : <RowsIcon />}
                </IconBtn>
            </div>

            {/* 빌더 본문 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: horizontal ? "auto" : "hidden", padding: 10 }}>
                {!active && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.7, padding: "6px 2px" }}>
                        가설 목록 / 그래프에서 <b style={{ color: "var(--text-secondary)" }}>우클릭 → 필터에 추가</b>(각자 OR).
                        <br /><b style={{ color: "var(--text-secondary)" }}>AND</b>는 칩을 다른 그룹으로 드래그해 합치고, 그룹 밖으로 빼면 다시 OR. 칩 클릭 = 제외(NOT).
                    </div>
                )}

                <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
                    <div style={{ display: "flex", flexDirection: horizontal ? "row" : "column", alignItems: horizontal ? "flex-start" : "stretch", gap: 8 }}>
                        {draft.groups.map((g, gi) => (
                            <Fragment key={gi}>
                                {gi > 0 && <OrDivider horizontal={horizontal} />}
                                <GroupBox gi={gi} horizontal={horizontal} onRemoveGroup={() => removeGroup(gi)}>
                                    {g.length === 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>비어 있음</span>}
                                    {g.map((l, idx) => (
                                        <Fragment key={l.hypothesisId}>
                                            {idx > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", alignSelf: "center" }}>·</span>}
                                            <FilterChip
                                                gi={gi}
                                                leaf={l}
                                                label={textById.get(l.hypothesisId) ?? `삭제된 가설(${l.hypothesisId})`}
                                                isUnknown={!textById.has(l.hypothesisId)}
                                                onToggleNegate={() => toggleNegate(gi, l.hypothesisId)}
                                                onRemove={() => removeLeaf(gi, l.hypothesisId)}
                                            />
                                        </Fragment>
                                    ))}
                                </GroupBox>
                            </Fragment>
                        ))}
                        {active && <NewGroupZone horizontal={horizontal} />}
                    </div>
                </DndContext>

                {unknown.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--rise)" }}>
                        삭제된 가설 {unknown.length}개 참조 — 저장 필터를 정리하세요.
                    </div>
                )}
            </div>
        </div>
    );
}

// ── 드래그 가능한 칩(그립으로 드래그, 클릭=제외 토글, ×=제거). transform 은 useDraggable 이 준다.
function FilterChip({ gi, leaf, label, isUnknown, onToggleNegate, onRemove }: { gi: number; leaf: FilterLeaf; label: string; isUnknown: boolean; onToggleNegate: () => void; onRemove: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${gi}:${leaf.hypothesisId}` });
    return (
        <span
            ref={setNodeRef}
            onClick={onToggleNegate}
            title={leaf.negated ? "제외(NOT) — 클릭하면 포함" : "포함 — 클릭하면 제외(NOT)"}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                maxWidth: "100%",
                boxSizing: "border-box",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: "18px",
                padding: "2px 8px",
                borderRadius: 14,
                background: leaf.negated ? "rgba(239,68,68,0.12)" : "var(--bg-tertiary)",
                color: leaf.negated ? "var(--rise)" : isUnknown ? "var(--text-tertiary)" : "var(--text-primary)",
                transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
                opacity: isDragging ? 0.4 : 1,
                zIndex: isDragging ? 20 : undefined,
                position: isDragging ? "relative" : undefined,
            }}
        >
            <span {...listeners} {...attributes} onClick={(e) => e.stopPropagation()} title="드래그해 그룹 이동(AND/OR)" style={{ display: "inline-flex", cursor: "grab", color: "var(--text-tertiary)", touchAction: "none" }}><GripIcon /></span>
            {leaf.negated && <span style={{ fontWeight: 700 }}>!</span>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                title="이 조건 제거"
                style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1, opacity: 0.55 }}
            >×</button>
        </span>
    );
}

// ── AND 그룹 박스(droppable) — 여기로 칩을 떨구면 그 그룹에 AND 합침.
function GroupBox({ gi, horizontal, onRemoveGroup, children }: { gi: number; horizontal: boolean; onRemoveGroup: () => void; children: React.ReactNode }): JSX.Element {
    const { setNodeRef, isOver } = useDroppable({ id: `group:${gi}` });
    return (
        <div
            ref={setNodeRef}
            style={{
                position: "relative",
                border: `0.5px solid ${isOver ? "var(--accent-primary)" : "var(--border-default)"}`,
                borderRadius: 8,
                padding: "8px 8px",
                background: isOver ? "var(--accent-soft)" : "var(--bg-secondary)",
                minWidth: horizontal ? 130 : undefined,
            }}
        >
            <div style={{ display: "flex", flexDirection: horizontal ? "column" : "row", flexWrap: horizontal ? "nowrap" : "wrap", alignItems: horizontal ? "flex-start" : "center", gap: 6, paddingRight: 18 }}>
                {children}
            </div>
            <button onClick={onRemoveGroup} title="그룹 삭제" style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
    );
}

// ── 새 OR 그룹 드롭존 — 칩을 여기로 떨구면 그룹 밖으로 빼서 별도 OR 그룹.
function NewGroupZone({ horizontal }: { horizontal: boolean }): JSX.Element {
    const { setNodeRef, isOver } = useDroppable({ id: "new-group" });
    return (
        <div
            ref={setNodeRef}
            title="칩을 여기로 끌면 새 OR 그룹으로 분리"
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                color: isOver ? "var(--accent-primary)" : "var(--text-tertiary)",
                border: `1px dashed ${isOver ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                borderRadius: 6,
                background: isOver ? "var(--accent-soft)" : "transparent",
                ...(horizontal ? { minWidth: 56, alignSelf: "stretch", padding: "6px 4px" } : { padding: "7px 8px" }),
            }}
        >
            OR 분리
        </div>
    );
}

// "또는" 구분선 — 세로 컨테이너=가로선 / 가로 컨테이너=세로선.
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

const menuBase: React.CSSProperties = {
    position: "absolute",
    zIndex: 41,
    background: "var(--bg-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};

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

function GripIcon(): JSX.Element {
    return (
        <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="2.5" r="1" /><circle cx="6" cy="2.5" r="1" />
            <circle cx="2" cy="6.5" r="1" /><circle cx="6" cy="6.5" r="1" />
            <circle cx="2" cy="10.5" r="1" /><circle cx="6" cy="10.5" r="1" />
        </svg>
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
