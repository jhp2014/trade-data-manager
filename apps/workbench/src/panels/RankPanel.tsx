import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useWorkbench } from "../store/workbench.js";
import { rankAxesQuery, axisLineQuery, allPointsQuery } from "../api/queries.js";
import { placePoint, unplacePoint, createRankAxis, renameRankAxis, deleteRankAxis, type RankPoint, type RankTarget } from "../api/rank.js";
import { loadJson, saveJson } from "../store/persist.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { Sep } from "../components/ControlChrome.js";
import type { RankAxis, PlacedPoint } from "@trade-data-manager/wire";

// 순위 배치 보드 — 멀티축 가로 레인. 관례: 오른쪽 = +좋음/강함, 왼쪽 = −나쁨/약함(사용자가 일관 입력).
//  · slot = 순위선 한 위치(타이 = 여러 타점 한 slot). PlacedPoint[](orderKey asc) → slotId 로 묶어 조립.
//  · 활성 타점(현재 종목, focus.activePoint) = 스팟에 핑크 강조, 활성이 배치된 축은 레인 배경 틴트로 구분.
//  · 상단 담기 라인 = 수동 작업셋(현재 타점 + 담은 종목, 같은 UI). 칩을 레인에 드래그해 배치(끝 = +담기). 접기 무관.
//  · 점 클릭 → 그 자리 타점 리스트 팝오버(행 클릭=goToPoint · +담기 · × 이 축 배치해제).
//  · Ctrl+휠 = 커서 지점 확대(레인별) · 더블클릭/⟲ = 원위치 · 그냥 휠 = 세로 스크롤 · 연결 = 활성 프로파일 오버레이.

const ACTIVE = "#0ea5e9";                        // 활성 스팟 — 밝은 스카이블루(푸른 계열), 글로우로 확 대비.
const ACTIVE_SOFT = "rgba(14,165,233,0.32)";
const ACTIVE_TINT = "rgba(14,165,233,0.09)";     // 활성이 배치된 레인 배경.
const TIE = "#7a869c";
const PAD = 72;                                   // 레인 좌우 여백(px) — 끝 타점보다 더 바깥에 꽂을 공간(넉넉히).
const LABEL_W = 138;
const ROW_H = 58;
const ORDER_KEY = "wb.rankAxisOrder";

interface Slot { slotId: string; orderKey: number; points: RankPoint[]; }
type View = { v0: number; v1: number };
interface DropInfo { axisId: string; leftPct: number; tie: boolean; target: RankTarget; }

const pk = (p: RankPoint): string => `${p.stockCode}|${p.date}|${p.time}`;
const parsePk = (s: string): RankPoint => { const [stockCode, date, time] = s.split("|"); return { stockCode, date, time }; };
const slotFrac = (i: number, s: number): number => (s <= 1 ? 0.5 : i / (s - 1));
const displayU = (frac: number, v: View): number => (frac - v.v0) / (v.v1 - v.v0);
const isZoomed = (v: View): boolean => v.v0 > 0.001 || v.v1 < 0.999;

function assemble(placed: PlacedPoint[]): Slot[] {
    const m = new Map<string, Slot>();
    for (const p of placed) {
        let s = m.get(p.slotId);
        if (!s) { s = { slotId: p.slotId, orderKey: p.orderKey, points: [] }; m.set(p.slotId, s); }
        s.points.push({ stockCode: p.stockCode, date: p.date, time: p.time });
    }
    return [...m.values()].sort((a, b) => a.orderKey - b.orderKey);
}

export function RankPanel(): JSX.Element {
    const activePoint = useWorkbench((s) => s.activePoint);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const qc = useQueryClient();

    const axesQ = useQuery(rankAxesQuery());
    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);

    // 축 순서 — 로컬 영속(서버는 id 순). pref 에 없는(새) 축은 뒤로.
    const [orderPref, setOrderPref] = useState<string[]>(() => loadJson(ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? []);
    const axes = useMemo(() => {
        const idx = new Map(orderPref.map((id, i) => [id, i]));
        return [...rawAxes].sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : 1));
    }, [rawAxes, orderPref]);
    const reorder = (draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.id);
        const from = ids.indexOf(draggedId), to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setOrderPref(ids); saveJson(ORDER_KEY, ids);
    };

    const lineQs = useQueries({ queries: axes.map((a) => axisLineQuery(a.id)) });
    const linesByAxis = useMemo(() => {
        const m = new Map<string, Slot[]>();
        axes.forEach((a, i) => m.set(a.id, assemble(lineQs[i]?.data ?? [])));
        return m;
    }, [axes, lineQs]);

    const pointsQ = useQuery(allPointsQuery());
    const nameByCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return m;
    }, [pointsQ.data]);
    const nameOf = (code: string): string => nameByCode.get(code) ?? code;

    // 담기(수동 작업셋). 활성 타점 = focus.activePoint(스팟 강조 + 라인 선두).
    const [tray, setTray] = useState<RankPoint[]>([]);
    const inTray = (p: RankPoint): boolean => tray.some((q) => pk(q) === pk(p));
    const addToTray = (p: RankPoint): void => setTray((t) => (t.some((q) => pk(q) === pk(p)) ? t : [...t, p]));
    const removeFromTray = (p: RankPoint): void => setTray((t) => t.filter((q) => pk(q) !== pk(p)));
    const activeAsPoint: RankPoint | null = activePoint ? { stockCode: activePoint.code, date: activePoint.date, time: activePoint.time } : null;

    const [views, setViews] = useState<Record<string, View>>({});
    const viewOf = (id: string): View => views[id] ?? { v0: 0, v1: 1 };
    const setView = (id: string, v: View): void => setViews((s) => ({ ...s, [id]: v }));
    const resetView = (id: string): void => setViews((s) => { const n = { ...s }; delete n[id]; return n; });
    const [pop, setPop] = useState<{ axisId: string; slotId: string; x: number; y: number } | null>(null);

    const activeMatches = (p: RankPoint): boolean =>
        !!activePoint && activePoint.code === p.stockCode && activePoint.date === p.date && activePoint.time === p.time;

    const invAxis = (axisId: string): void => void qc.invalidateQueries({ queryKey: axisLineQuery(axisId).queryKey });
    const invAxes = (): void => void qc.invalidateQueries({ queryKey: rankAxesQuery().queryKey });
    const placeMut = useMutation({ mutationFn: (v: { axisId: string; point: RankPoint; target: RankTarget }) => placePoint(v.axisId, v.point, v.target), onSuccess: (_r, v) => invAxis(v.axisId) });
    const unplaceMut = useMutation({ mutationFn: (v: { axisId: string; point: RankPoint }) => unplacePoint(v.axisId, v.point), onSuccess: (_r, v) => invAxis(v.axisId) });
    const createMut = useMutation({ mutationFn: (v: { name: string; scope: "point" | "day" }) => createRankAxis(v.name, v.scope), onSuccess: invAxes });
    const renameMut = useMutation({ mutationFn: (v: { id: string; name: string }) => renameRankAxis(v.id, v.name), onSuccess: invAxes });
    const deleteMut = useMutation({ mutationFn: (id: string) => deleteRankAxis(id), onSuccess: invAxes });

    // ── 드래그(dnd-kit) — 담기 칩 → 레인. 포인터 x 로 목표(타이/between) + 라이브 인디케이터. ──
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const dragStartX = useRef(0);
    const trackRefs = useRef<Map<string, HTMLElement>>(new Map());
    const [drop, setDrop] = useState<DropInfo | null>(null);

    const computeDrop = (axisId: string, clientX: number): DropInfo | null => {
        const el = trackRefs.current.get(axisId);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const v = viewOf(axisId);
        const slots = linesByAxis.get(axisId) ?? [];
        const trackW = rect.width - 2 * PAD;
        const uPtr = (clientX - rect.left - PAD) / trackW;
        const nodes = slots.map((s, i) => ({ s, u: displayU(slotFrac(i, slots.length), v) }));
        let near: { s: Slot; u: number; d: number } | null = null;
        for (const n of nodes) {
            const d = Math.abs(rect.left + PAD + n.u * trackW - clientX);
            if (near == null || d < near.d) near = { s: n.s, u: n.u, d };
        }
        if (near && near.d <= 14) return { axisId, leftPct: near.u * 100, tie: true, target: { kind: "slot", slotId: near.s.slotId } };
        let prev: Slot | undefined, next: Slot | undefined;
        for (const n of nodes) { if (n.u <= uPtr) prev = n.s; else { next = n.s; break; } }
        return { axisId, leftPct: Math.max(-8, Math.min(108, uPtr * 100)), tie: false, target: { kind: "between", prevSlotId: prev?.slotId, nextSlotId: next?.slotId } };
    };

    const draggedPoint = (id: unknown): RankPoint | null => (typeof id === "string" && id.startsWith("chip:") ? parsePk(id.slice(5)) : null);
    const [dragName, setDragName] = useState<string | null>(null);
    const onDragStart = (e: DragStartEvent): void => {
        dragStartX.current = (e.activatorEvent as PointerEvent).clientX ?? 0;
        setPop(null);
        const p = draggedPoint(e.active.id);
        setDragName(p ? nameOf(p.stockCode) : null);
    };
    const onDragMove = (e: DragMoveEvent): void => {
        const overId = e.over?.id;
        if (typeof overId !== "string" || !draggedPoint(e.active.id)) { setDrop(null); return; }
        setDrop(computeDrop(overId, dragStartX.current + e.delta.x));
    };
    const onDragEnd = (e: DragEndEvent): void => {
        const overId = e.over?.id;
        const point = draggedPoint(e.active.id);
        if (typeof overId === "string" && point) {
            const d = computeDrop(overId, dragStartX.current + e.delta.x);
            if (d) placeMut.mutate({ axisId: overId, point, target: d.target });
        }
        setDrop(null); setDragName(null);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDrop(null); setDragName(null); }}>
                {/* 상단 = 담기 라인(작업셋, 가로 스크롤) */}
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", minWidth: 0 }}>
                    <TrayLine
                        tray={tray} current={activeAsPoint}
                        nameOf={nameOf} activeMatches={activeMatches}
                        canAdd={!!activeAsPoint && !inTray(activeAsPoint)}
                        onAddActive={() => activeAsPoint && addToTray(activeAsPoint)}
                        onRemove={removeFromTray}
                        onGo={(p) => goToPoint({ date: p.date, code: p.stockCode, time: p.time }, "rank")}
                    />
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
                    {axesQ.isLoading && <div style={muted}>불러오는 중…</div>}
                    <div style={{ position: "relative" }}>
                        {axes.map((ax) => {
                            const slots = linesByAxis.get(ax.id) ?? [];
                            const activePlaced = !!activePoint && slots.some((s) => s.points.some(activeMatches));
                            return (
                                <Lane
                                    key={ax.id}
                                    axis={ax} slots={slots} view={viewOf(ax.id)}
                                    setView={(v) => setView(ax.id, v)} resetView={() => resetView(ax.id)}
                                    registerTrack={(el) => { if (el) trackRefs.current.set(ax.id, el); else trackRefs.current.delete(ax.id); }}
                                    activeMatches={activeMatches} activePlaced={activePlaced}
                                    drop={drop && drop.axisId === ax.id ? drop : null} nameOf={nameOf}
                                    onNodeClick={(slotId, x, y) => setPop({ axisId: ax.id, slotId, x, y })}
                                    onRename={(name) => renameMut.mutate({ id: ax.id, name })}
                                    onDelete={() => { if (confirm(`축 "${ax.name}" 을 삭제할까요? 배치도 함께 제거됩니다.`)) deleteMut.mutate(ax.id); }}
                                    onReorderDrop={(dragged) => reorder(dragged, ax.id)}
                                />
                            );
                        })}
                    </div>
                    <AddAxisRow onCreate={(name, scope) => createMut.mutate({ name, scope })} />
                </div>

                <DragOverlay dropAnimation={null}>
                    {dragName && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4, background: "var(--bg-tertiary)", border: `1px solid ${ACTIVE}`, boxShadow: "0 6px 18px rgba(0,0,0,0.28)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{dragName}</span>
                    )}
                </DragOverlay>
            </DndContext>

            {pop && (() => {
                const slots = linesByAxis.get(pop.axisId) ?? [];
                const slot = slots.find((s) => s.slotId === pop.slotId);
                const ax = axes.find((a) => a.id === pop.axisId);
                if (!slot || !ax) return null;
                return (
                    <SlotPopover axisName={ax.name} scope={ax.scope} points={slot.points} x={pop.x} y={pop.y}
                        nameOf={nameOf} activeMatches={activeMatches} inTray={inTray}
                        onClose={() => setPop(null)}
                        onGo={(p) => { goToPoint({ date: p.date, code: p.stockCode, time: p.time }, "rank"); setPop(null); }}
                        onAdd={(p) => { addToTray(p); setPop(null); }}
                        onUnplace={(p) => { unplaceMut.mutate({ axisId: pop.axisId, point: p }); setPop(null); }} />
                );
            })()}
        </div>
    );
}

const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "10px 12px" };
const ctlBtn: CSSProperties = { border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "1px 3px" };

// ── 담기 라인(작업셋) — [현재 선택 = 텍스트] │ [담은 종목 칩…] [+담기]. 남은 폭에서 가로 스크롤.
//    현재 선택은 텍스트만(드래그 아님), 담기와 | 로 구분. 현재가 담기에도 있으면 양쪽 중복 표시(의도).
function TrayLine({ tray, current, nameOf, activeMatches, canAdd, onAddActive, onRemove, onGo }: {
    tray: RankPoint[]; current: RankPoint | null; nameOf: (c: string) => string; activeMatches: (p: RankPoint) => boolean;
    canAdd: boolean; onAddActive: () => void; onRemove: (p: RankPoint) => void; onGo: (p: RankPoint) => void;
}): JSX.Element {
    const wheelRef = useHorizontalWheel<HTMLDivElement>(true);
    const empty = tray.length === 0 && !current;
    return (
        <div ref={wheelRef} className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", flex: 1, minWidth: 0 }}>
            {empty && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>타점 선택·담기 후 레인으로 드래그해 배치</span>}
            {current && (
                <>
                    <button onClick={() => onGo(current)} title="현재 타점으로 이동" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACTIVE, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{nameOf(current.stockCode)}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{current.date.slice(5)} {current.time.slice(0, 5)}</span>
                    </button>
                    <Sep />
                </>
            )}
            {tray.map((p) => <PointItem key={pk(p)} point={p} name={nameOf(p.stockCode)} active={activeMatches(p)} onGo={() => onGo(p)} onRemove={() => onRemove(p)} />)}
            <button onClick={onAddActive} disabled={!canAdd} title={canAdd ? "현재 타점을 담기" : "담을 새 타점을 선택하세요"}
                style={{ flexShrink: 0, border: `1px dashed ${canAdd ? ACTIVE : "var(--border-default)"}`, borderRadius: 4, background: "transparent", color: canAdd ? ACTIVE : "var(--text-tertiary)", cursor: canAdd ? "pointer" : "default", opacity: canAdd ? 1 : 0.5, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", whiteSpace: "nowrap" }}>+ 담기</button>
        </div>
    );
}

// 담기 라인 항목 — 드래그 소스(전체가 손잡이), 이름 클릭=이동, × 빼기. 활성이면 핑크.
function PointItem({ point, name, active, onGo, onRemove }: { point: RankPoint; name: string; active: boolean; onGo: () => void; onRemove?: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${pk(point)}` });
    const stop = (e: ReactPointerEvent): void => e.stopPropagation();
    return (
        <span ref={setNodeRef} {...listeners} {...attributes} title="드래그해 레인에 배치"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 6px 2px 7px", borderRadius: 4, border: `1px solid ${active ? ACTIVE : "var(--border-default)"}`, background: active ? ACTIVE_SOFT : "var(--bg-tertiary)", cursor: "grab", touchAction: "none", opacity: isDragging ? 0.4 : 1, whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: active ? ACTIVE : "var(--text-tertiary)", flexShrink: 0 }} />
            <button onPointerDown={stop} onClick={onGo} title="이 종목으로 이동" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{point.date.slice(5)} {point.time.slice(0, 5)}</span>
            </button>
            {onRemove && <button onPointerDown={stop} onClick={onRemove} title="담기에서 빼기" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", padding: "0 1px", fontSize: 13, lineHeight: 1 }}>×</button>}
        </span>
    );
}

// ── 한 축 레인 ─────────────────────────────────────────────────────────────
function Lane({
    axis, slots, view, setView, resetView, registerTrack, activeMatches, activePlaced, drop, nameOf,
    onNodeClick, onRename, onDelete, onReorderDrop,
}: {
    axis: RankAxis; slots: Slot[]; view: View; setView: (v: View) => void; resetView: () => void;
    registerTrack: (el: HTMLElement | null) => void;
    activeMatches: (p: RankPoint) => boolean; activePlaced: boolean; drop: DropInfo | null; nameOf: (c: string) => string;
    onNodeClick: (slotId: string, x: number, y: number) => void; onRename: (name: string) => void; onDelete: () => void;
    onReorderDrop: (draggedAxisId: string) => void;
}): JSX.Element {
    const { setNodeRef, isOver } = useDroppable({ id: axis.id });
    const trackRef = useRef<HTMLDivElement | null>(null);
    const [hover, setHover] = useState(false);
    const [reorderOver, setReorderOver] = useState(false);

    // 인라인 이름 편집(팝업 prompt 대신) — Enter=저장/Esc=취소/blur=저장. Enter·blur 이중발화는 blur 단일화로 회피.
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");
    const escRef = useRef(false);
    const startEdit = (): void => { setEditText(axis.name); setEditing(true); };
    const commitEdit = (): void => { const t = editText.trim(); setEditing(false); if (t && t !== axis.name) onRename(t); };

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent): void => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const t = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD) / (rect.width - 2 * PAD)));
            const width = view.v1 - view.v0;
            const anchor = view.v0 + t * width;
            const nw = Math.max(0.1, Math.min(1, width * (e.deltaY < 0 ? 0.82 : 1.22)));
            let v0 = anchor - t * nw, v1 = v0 + nw;
            if (v0 < 0) { v0 = 0; v1 = nw; }
            if (v1 > 1) { v1 = 1; v0 = 1 - nw; }
            setView({ v0, v1 });
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [view, setView]);

    const setRefs = (el: HTMLDivElement | null): void => { trackRef.current = el; setNodeRef(el); registerTrack(el); };

    return (
        <div
            style={{ position: "relative", height: ROW_H, borderTop: reorderOver ? "2px solid var(--accent-primary)" : "2px solid transparent", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", background: activePlaced ? ACTIVE_TINT : "transparent" }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-rank-axis")) { e.preventDefault(); setReorderOver(true); } }}
            onDragLeave={() => setReorderOver(false)}
            onDrop={(e) => { const id = e.dataTransfer.getData("application/x-rank-axis"); setReorderOver(false); if (id) onReorderDrop(id); }}
        >
            {/* 라벨(한 줄) — 손잡이·이름(더블클릭/✎ 인라인 편집)·삭제 */}
            <div style={{ width: LABEL_W, flexShrink: 0, padding: "0 8px 0 6px", display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span draggable onDragStart={(e) => { e.dataTransfer.setData("application/x-rank-axis", axis.id); e.dataTransfer.effectAllowed = "move"; }} title="드래그해 축 순서 변경"
                    style={{ cursor: "grab", color: "var(--text-tertiary)", flexShrink: 0, fontSize: 12, lineHeight: 1, opacity: hover ? 1 : 0.35 }}>⠿</span>
                {editing ? (
                    <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); escRef.current = true; e.currentTarget.blur(); } }}
                        onBlur={() => { if (escRef.current) { escRef.current = false; setEditing(false); } else commitEdit(); }}
                        style={{ flex: 1, minWidth: 0, border: "1px solid var(--accent-primary)", borderRadius: 3, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "2px 5px", fontSize: 12.5, fontWeight: 600, outline: "none" }} />
                ) : (
                    <>
                        <span onDoubleClick={startEdit} title={`${axis.name} · 더블클릭 = 이름 변경`} style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{axis.name}</span>
                        {hover && (
                            <span style={{ display: "inline-flex", gap: 1, flexShrink: 0 }}>
                                <button onClick={startEdit} title="이름 변경" style={ctlBtn}>✎</button>
                                <button onClick={onDelete} title="축 삭제" style={{ ...ctlBtn, color: "var(--rise)" }}>🗑</button>
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* 트랙 */}
            <div ref={setRefs} onDoubleClick={resetView} style={{ position: "relative", flex: 1, height: "100%", background: isOver ? "var(--accent-soft)" : "transparent" }}>
                <div style={{ position: "absolute", left: PAD - 16, right: PAD - 16, top: "50%", height: 2, background: "var(--border-default)", transform: "translateY(-50%)" }} />
                <span style={endLbl(true)}>−</span>
                <span style={endLbl(false)}>+</span>

                {slots.map((slot, i) => {
                    const u = displayU(slotFrac(i, slots.length), view);
                    if (u < -0.03 || u > 1.03) return null;
                    const hasActive = slot.points.some(activeMatches);
                    const tie = slot.points.length > 1;
                    const left = `calc(${PAD}px + ${u} * (100% - ${2 * PAD}px))`;
                    return (
                        <div key={slot.slotId} onClick={(e) => onNodeClick(slot.slotId, e.clientX, e.clientY)}
                            title={tie ? `타이 ${slot.points.length}건 — 클릭` : `${nameOf(slot.points[0].stockCode)} — 클릭`}
                            style={{ position: "absolute", left, top: "50%", transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: hasActive ? 3 : 2 }}>
                            {tie ? (
                                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 17, padding: "0 5px", borderRadius: 8, background: hasActive ? ACTIVE : TIE, color: "#fff", fontSize: 10, fontWeight: 700, boxShadow: hasActive ? `0 0 0 3px ${ACTIVE_SOFT}, 0 0 7px 1px ${ACTIVE}` : "none", fontVariantNumeric: "tabular-nums" }}>{slot.points.length}</span>
                            ) : (
                                <span style={{ display: "block", width: hasActive ? 14 : 11, height: hasActive ? 14 : 11, borderRadius: "50%", background: hasActive ? ACTIVE : "var(--text-secondary)", boxShadow: hasActive ? `0 0 0 3px ${ACTIVE_SOFT}, 0 0 7px 1px ${ACTIVE}` : "none" }} />
                            )}
                        </div>
                    );
                })}

                {drop && (
                    <div style={{ position: "absolute", top: 6, bottom: 6, left: `calc(${PAD}px + ${drop.leftPct / 100} * (100% - ${2 * PAD}px))`, width: drop.tie ? 0 : 2, transform: "translateX(-50%)", background: drop.tie ? "transparent" : "var(--accent-primary)", boxShadow: drop.tie ? "none" : "0 0 0 1px var(--bg-primary)", pointerEvents: "none", zIndex: 4 }}>
                        {drop.tie && <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--accent-primary)" }} />}
                    </div>
                )}
                {isZoomed(view) && <button onClick={resetView} title="줌 원위치" style={{ position: "absolute", right: 4, top: 3, ...ctlBtn }}>⟲</button>}
            </div>
        </div>
    );
}

const endLbl = (leftSide: boolean): CSSProperties => ({ position: "absolute", [leftSide ? "left" : "right"]: 6, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)" });

// ── 하단 축 추가 행(필터 추가 방식) ────────────────────────────────────────
function AddAxisRow({ onCreate }: { onCreate: (name: string, scope: "point" | "day") => void }): JSX.Element {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [scope, setScope] = useState<"point" | "day">("point");
    const submit = (): void => { const n = name.trim(); if (n) { onCreate(n, scope); setName(""); setScope("point"); setOpen(false); } };
    if (!open) return (
        <button onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", borderTop: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", padding: "8px 12px", fontSize: 12.5 }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> 축 추가
        </button>
    );
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderTop: "1px dashed var(--border-default)" }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); else if (e.key === "Escape") setOpen(false); }}
                placeholder="축 이름(예: 거래대금)" style={{ flex: 1, minWidth: 0, border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "4px 8px", fontSize: 12.5, outline: "none" }} />
            <select value={scope} onChange={(e) => setScope(e.target.value as "point" | "day")} title="배치 단위" style={{ border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "4px 6px", fontSize: 12 }}>
                <option value="point">타점</option>
                <option value="day">하루</option>
            </select>
            <button onClick={submit} disabled={!name.trim()} style={{ border: "none", borderRadius: 4, background: "var(--accent-primary)", color: "#fff", cursor: "pointer", fontSize: 12, padding: "4px 10px" }}>추가</button>
            <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13 }}>×</button>
        </div>
    );
}

// ── 클릭 리스트 팝오버 (종목코드 제외) ─────────────────────────────────────
function SlotPopover({
    axisName, scope, points, x, y, nameOf, activeMatches, inTray, onClose, onGo, onAdd, onUnplace,
}: {
    axisName: string; scope: string; points: RankPoint[]; x: number; y: number; nameOf: (c: string) => string;
    activeMatches: (p: RankPoint) => boolean; inTray: (p: RankPoint) => boolean;
    onClose: () => void; onGo: (p: RankPoint) => void; onAdd: (p: RankPoint) => void; onUnplace: (p: RankPoint) => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const h = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
        return () => { clearTimeout(id); document.removeEventListener("mousedown", h); };
    }, [onClose]);
    const px = Math.min(x + 12, window.innerWidth - 250);
    const py = Math.max(8, Math.min(y + 12, window.innerHeight - 40 - points.length * 40));
    return (
        <div ref={ref} style={{ position: "fixed", left: px, top: py, zIndex: 60, minWidth: 200, maxWidth: 270, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 9, boxShadow: "0 10px 30px rgba(0,0,0,0.24)", overflow: "hidden" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-tertiary)", padding: "8px 12px 4px" }}>{axisName} · 이 자리 {points.length}건{scope === "day" ? " · 하루단위" : ""}</div>
            {points.map((p, i) => {
                const act = activeMatches(p), tray = inTray(p);
                return (
                    <div key={i} onClick={() => onGo(p)} title="이 타점으로 이동"
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px 7px 12px", cursor: "pointer", borderTop: "1px solid var(--border-subtle)", background: act ? ACTIVE_SOFT : "transparent" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(p.stockCode)}</div>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{p.date.slice(5)} {p.time.slice(0, 5)}</div>
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); onAdd(p); }} title="담기" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: `1px solid ${tray ? ACTIVE : "var(--border-default)"}`, background: tray ? ACTIVE_SOFT : "var(--bg-primary)", color: tray ? ACTIVE : "var(--text-tertiary)", cursor: "pointer", fontSize: 13 }}>+</button>
                        <button onClick={(e) => { e.stopPropagation(); onUnplace(p); }} title="이 축에서 배치 해제" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-primary)", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13 }}>×</button>
                    </div>
                );
            })}
        </div>
    );
}
