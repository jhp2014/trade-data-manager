import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useWorkbench, type RankBand } from "../store/workbench.js";
import { rankAxesQuery, axisLineQuery, allPointsQuery } from "../api/queries.js";
import { placePoint, unplacePoint, createRankAxis, renameRankAxis, deleteRankAxis, type RankPoint, type RankTarget } from "../api/rank.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { Sep } from "../components/ControlChrome.js";
import { SavedFilterBar } from "./rank/SavedFilterBar.js";
import type { RankAxis, PlacedPoint } from "@trade-data-manager/wire";

// 현재 타점 위치 마커(2D 물방울 핀) 애니메이션 — 전환 시 드롭 1회 + 미세 부유. 화면에 하나뿐이라 과하지 않음.
const PIN_KF_ID = "rank-cur-pin-kf";
if (typeof document !== "undefined" && !document.getElementById(PIN_KF_ID)) {
    const st = document.createElement("style");
    st.id = PIN_KF_ID;
    st.textContent = "@keyframes rankCurDrop{0%{transform:translate(-50%,-13px);opacity:0}55%{opacity:1}100%{transform:translate(-50%,0)}}@keyframes rankCurBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}.rank-cur-pin{animation:rankCurDrop .42s cubic-bezier(.34,1.56,.64,1)}.rank-cur-pin>svg{display:block;animation:rankCurBob 1.9s ease-in-out infinite}";
    document.head.appendChild(st);
}

function CurrentMarker({ color }: { color: string }): JSX.Element {
    return (
        <span className="rank-cur-pin" aria-hidden style={{ position: "absolute", left: "50%", bottom: "calc(100% + 3px)", width: 16, height: 21, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 6 }}>
            <svg width="16" height="21" viewBox="0 0 26 34">
                <path d="M13 3.6 C7.5 3.6 3.6 8 3.6 12.6 C3.6 18.4 13 30.4 13 30.4 C13 30.4 22.4 18.4 22.4 12.6 C22.4 8 18.5 3.6 13 3.6 Z" fill={color} />
                <circle cx="13" cy="12.4" r="4.4" fill="var(--bg-primary)" />
            </svg>
        </span>
    );
}

// 순위 배치 보드 — 멀티축 가로 레인. 관례: 오른쪽 = +좋음/강함, 왼쪽 = −나쁨/약함(사용자가 일관 입력).
//  · slot = 순위선 한 위치(타이 = 여러 타점 한 slot). PlacedPoint[](orderKey asc) → slotId 로 묶어 조립.
//  · 활성 타점(현재 종목, focus.activePoint) = 스팟에 핑크 강조, 활성이 배치된 축은 레인 배경 틴트로 구분.
//  · 상단 담기 라인 = 수동 작업셋(현재 타점 + 담은 종목, 같은 UI). 칩을 레인에 드래그해 배치(끝 = +담기). 접기 무관.
//  · 점 클릭 → 그 자리 타점 리스트 팝오버(행 클릭=goToPoint · +담기 · × 이 축 배치해제).
//  · Ctrl+휠 = 커서 지점 확대(레인별) · 더블클릭/⟲ = 원위치 · 그냥 휠 = 세로 스크롤 · 연결 = 활성 프로파일 오버레이.

const ACTIVE = "#0ea5e9";                        // 활성 스팟 — 밝은 스카이블루(푸른 계열), 글로우로 확 대비.
const ACTIVE_SOFT = "rgba(14,165,233,0.32)";
const ACTIVE_TINT = "rgba(14,165,233,0.09)";     // 활성이 배치된 레인 배경.
const FILTER = "#e24b4a";                         // 필터 밴드 경계(우클릭 지정) — 붉은 삼각 헤드 + 라인 채색(밴드 배경 대신).
const TIE = "#7a869c";
const PAD = 52;                                   // 스팟 좌우 여백(px) — 끝 스팟이 라인 끝 가까이(오버런 = PAD−LINE_PAD 만큼만).
const LINE_PAD = 32;                              // 축 라인 여백(고정, PAD와 독립) — 라인 끝을 패널 가장자리 가까이(오버런 = PAD−LINE_PAD).
const LABEL_W = 138;
const ROW_H = 58;

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
    // 필터 밴드(분석 대시보드와 공유) — 우클릭으로 이 축 이상/이하 경계 지정.
    const rankBands = useWorkbench((s) => s.rankBands);
    const setRankBound = useWorkbench((s) => s.setRankBound);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    // 링크 공유(시트와 양방향) — 호버·축순서.
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);
    const [filterMenu, setFilterMenu] = useState<{ axisId: string; slotId: string; x: number; y: number } | null>(null);
    const qc = useQueryClient();

    const axesQ = useQuery(rankAxesQuery());
    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);

    // 축 순서 — store 공유(배치↔시트 양방향, localStorage 영속). pref 에 없는(새) 축은 뒤로.
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
        setRankAxisOrder(ids);
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

    // 담기(작업셋) = 공유 pinned(시트 핀과 같은 상태). 활성 타점 = focus.activePoint(스팟 강조 + 라인 선두).
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
    const tray = useMemo(() => pinned.map(parsePk), [pinned]);
    const inTray = (p: RankPoint): boolean => pinnedSet.has(pk(p));
    const addToTray = (p: RankPoint): void => { if (!pinnedSet.has(pk(p))) togglePin(pk(p)); };
    const removeFromTray = (p: RankPoint): void => togglePin(pk(p));
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

                <SavedFilterBar axes={axes} />

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
                                    hoveredKey={hoveredPoint} onHoverKey={setHoveredPoint}
                                    drop={drop && drop.axisId === ax.id ? drop : null} nameOf={nameOf}
                                    band={rankBands[ax.id]}
                                    onNodeClick={(slotId, x, y) => setPop({ axisId: ax.id, slotId, x, y })}
                                    onNodeContext={(slotId, x, y) => { setPop(null); setFilterMenu({ axisId: ax.id, slotId, x, y }); }}
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

            {filterMenu && (() => {
                const ax = axes.find((a) => a.id === filterMenu.axisId);
                if (!ax) return null;
                const band = rankBands[filterMenu.axisId];
                return (
                    <FilterMenu x={filterMenu.x} y={filterMenu.y} axisName={ax.name} band={band} slotId={filterMenu.slotId}
                        onSet={(edge) => { setRankBound(filterMenu.axisId, edge, filterMenu.slotId); setFilterMenu(null); }}
                        onClear={() => { clearRankBand(filterMenu.axisId); setFilterMenu(null); }}
                        onClose={() => setFilterMenu(null)} />
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
                    <button onClick={() => onGo(current)} title="현재 타점으로 이동" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACTIVE, flexShrink: 0 }} />
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, width: 80, minWidth: 0, overflow: "hidden" }}>
                            <span title={nameOf(current.stockCode)} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(current.stockCode)}</span>
                            <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{current.date.slice(5)} {current.time.slice(0, 5)}</span>
                        </span>
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

// 담기 라인 항목 — 드래그 소스(전체가 손잡이). 앞 그랩 아이콘=드래그 가능 표시, 이름 클릭=이동, × 빼기. 활성이면 테두리 강조.
function PointItem({ point, name, active, onGo, onRemove }: { point: RankPoint; name: string; active: boolean; onGo: () => void; onRemove?: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${pk(point)}` });
    const stop = (e: ReactPointerEvent): void => e.stopPropagation();
    return (
        <span ref={setNodeRef} {...listeners} {...attributes} title="드래그해 레인에 배치"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 6px 2px 6px", borderRadius: 4, border: `1px solid ${active ? ACTIVE : "var(--border-default)"}`, background: "var(--bg-tertiary)", cursor: "grab", touchAction: "none", opacity: isDragging ? 0.4 : 1, whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1, flexShrink: 0 }}>⠿</span>
            <button onPointerDown={stop} onClick={onGo} title="이 종목으로 이동" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, width: 70, minWidth: 0, overflow: "hidden" }}>
                <span title={name} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{point.date.slice(5)} {point.time.slice(0, 5)}</span>
            </button>
            {onRemove && <button onPointerDown={stop} onClick={onRemove} title="담기에서 빼기" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", padding: "0 1px", fontSize: 13, lineHeight: 1 }}>×</button>}
        </span>
    );
}

// ── 한 축 레인 ─────────────────────────────────────────────────────────────
function Lane({
    axis, slots, view, setView, resetView, registerTrack, activeMatches, activePlaced, hoveredKey, onHoverKey, drop, nameOf, band,
    onNodeClick, onNodeContext, onRename, onDelete, onReorderDrop,
}: {
    axis: RankAxis; slots: Slot[]; view: View; setView: (v: View) => void; resetView: () => void;
    registerTrack: (el: HTMLElement | null) => void;
    activeMatches: (p: RankPoint) => boolean; activePlaced: boolean;
    hoveredKey: string | null; onHoverKey: (k: string | null) => void;
    drop: DropInfo | null; nameOf: (c: string) => string;
    band: RankBand | undefined;
    onNodeClick: (slotId: string, x: number, y: number) => void; onNodeContext: (slotId: string, x: number, y: number) => void;
    onRename: (name: string) => void; onDelete: () => void;
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

    // 트랙 너비 관측 — 너무 좁으면(여백 2*PAD 이 폭을 잡아먹어 배치가 어설픔) 축 시각화를 숨김.
    const [trackW, setTrackW] = useState(0);
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => setTrackW(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const tooNarrow = trackW > 0 && trackW < 2 * PAD + 50;

    const setRefs = (el: HTMLDivElement | null): void => { trackRef.current = el; setNodeRef(el); registerTrack(el); };

    // 필터 밴드 경계 → 현재 뷰(줌) u 위치. 한쪽만이면 반대편은 트랙 끝(0/1)까지 밴드.
    const uOf = (slotId?: string): number | null => {
        if (!slotId) return null;
        const i = slots.findIndex((s) => s.slotId === slotId);
        return i < 0 ? null : displayU(slotFrac(i, slots.length), view);
    };
    const loU = uOf(band?.lo);
    const hiU = uOf(band?.hi);
    const hasBand = loU != null || hiU != null;

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
            <div ref={setRefs} onDoubleClick={resetView}
                style={{ position: "relative", flex: 1, height: "100%", background: isOver ? "var(--accent-soft)" : "transparent" }}>
                {tooNarrow ? (
                    <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", pointerEvents: "none" }}>패널이 좁아 축 숨김</span>
                ) : (<>
                <div style={{ position: "absolute", left: LINE_PAD, right: LINE_PAD, top: "50%", height: 2, background: "var(--border-default)", transform: "translateY(-50%)" }} />
                <ScaleEnd side="left" />
                <ScaleEnd side="right" />

                {hasBand && (
                    <>
                        <div style={{
                            position: "absolute", top: "50%", height: 2, borderRadius: 1, transform: "translateY(-50%)",
                            left: loU != null ? `calc(${PAD}px + ${loU} * (100% - ${2 * PAD}px))` : `${LINE_PAD}px`,
                            right: hiU != null ? `calc(100% - (${PAD}px + ${hiU} * (100% - ${2 * PAD}px)))` : `${LINE_PAD}px`,
                            background: FILTER, boxShadow: "0 0 7px 1px rgba(226,75,74,0.75)", pointerEvents: "none", zIndex: 1,
                        }} />
                        {loU != null && <RangeBracket u={loU} side="open" />}
                        {hiU != null && <RangeBracket u={hiU} side="close" />}
                    </>
                )}

                {slots.map((slot, i) => {
                    const u = displayU(slotFrac(i, slots.length), view);
                    if (u < -0.03 || u > 1.03) return null;
                    const hasActive = slot.points.some(activeMatches);
                    const hasHover = slot.points.some((p) => hoveredKey === pk(p));
                    const tie = slot.points.length > 1;
                    const left = `calc(${PAD}px + ${u} * (100% - ${2 * PAD}px))`;
                    // 채널 분리: 현재=위치 마커(아이콘), 호버=얇은 링. 핀·소프트는 레인에 표시 안 함.
                    const spotBg = hasActive ? ACTIVE : tie ? TIE : "var(--text-secondary)";
                    const glow = hasHover ? "0 0 0 2px var(--border-strong)" : "none";
                    return (
                        <div key={slot.slotId} onClick={(e) => onNodeClick(slot.slotId, e.clientX, e.clientY)}
                            onContextMenu={(e) => { e.preventDefault(); onNodeContext(slot.slotId, e.clientX, e.clientY); }}
                            onMouseEnter={() => onHoverKey(pk(slot.points[0]))} onMouseLeave={() => onHoverKey(null)}
                            title={tie ? `타이 ${slot.points.length}건 — 클릭 / 우클릭=필터 경계` : `${nameOf(slot.points[0].stockCode)} — 클릭 / 우클릭=필터 경계`}
                            style={{ position: "absolute", left, top: "50%", transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: hasActive ? 5 : 2 }}>
                            {hasActive && <CurrentMarker color={ACTIVE} />}
                            {tie ? (
                                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 17, padding: "0 5px", borderRadius: 8, background: spotBg, color: "#fff", fontSize: 10, fontWeight: 700, boxShadow: glow, fontVariantNumeric: "tabular-nums" }}>{slot.points.length}</span>
                            ) : (
                                <span style={{ display: "block", width: 8, height: 8, borderRadius: "50%", background: spotBg, boxShadow: glow }} />
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
                </>)}
            </div>
        </div>
    );
}

// 끝 스케일 마커 — 라인 양 끝의 수직 눈금선(|) + 아래 −/+ 라벨(스케일 숫자처럼).
function ScaleEnd({ side }: { side: "left" | "right" }): JSX.Element {
    const isL = side === "left";
    const anchor: CSSProperties = isL ? { left: LINE_PAD, transform: "translateX(-50%)" } : { right: LINE_PAD, transform: "translateX(50%)" };
    return (
        <>
            <span style={{ position: "absolute", top: "50%", marginTop: -6.5, width: 2, height: 13, background: "var(--text-tertiary)", ...anchor }} />
            <span style={{ position: "absolute", top: "calc(50% + 8px)", fontSize: 13, fontWeight: 700, lineHeight: 1, color: "var(--text-tertiary)", ...anchor }}>{isL ? "−" : "+"}</span>
        </>
    );
}

// 필터 범위 괄호 — 경계 spot 바깥으로 살짝 벗어난 대괄호([ = 이상 경계 / ] = 이하 경계). spot과 겹치지 않게.
function RangeBracket({ u, side }: { u: number; side: "open" | "close" }): JSX.Element {
    const pos = `calc(${PAD}px + ${u} * (100% - ${2 * PAD}px))`;
    const common: CSSProperties = {
        position: "absolute", top: "50%", transform: "translateY(-50%)", width: 6, height: 20,
        border: `2px solid ${FILTER}`, pointerEvents: "none", zIndex: 5,
    };
    return side === "open"
        ? <span style={{ ...common, left: `calc(${pos} - 14px)`, borderRight: "none", borderRadius: "2px 0 0 2px" }} />
        : <span style={{ ...common, left: `calc(${pos} + 8px)`, borderLeft: "none", borderRadius: "0 2px 2px 0" }} />;
}

// 커서 앵커 팝오버 위치 — 마운트 후 실제 크기를 재서 뷰포트 안으로 클램프(+ 넘치면 커서 반대편으로 플립).
//  · dockview 패널이 transform 을 써서 fixed 가 갇히므로 팝오버는 body 로 portal 해 실제 뷰포트 기준을 회복시킨다.
function useClampedPos(x: number, y: number, ref: RefObject<HTMLElement>): { left: number; top: number } {
    const [pos, setPos] = useState({ left: x + 12, top: y + 12 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const m = 8, w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
        let left = x + 12; if (left + w > vw - m) left = x - 12 - w; left = Math.max(m, Math.min(left, vw - m - w));
        let top = y + 12; if (top + h > vh - m) top = y - 12 - h; top = Math.max(m, Math.min(top, vh - m - h));
        setPos({ left, top });
    }, [x, y, ref]);
    return pos;
}

// ── 우클릭 필터 경계 메뉴 — 이상(lo)/이하(hi) 경계 지정·해제. 이미 그 경계면 '해제' 표기(토글). ──
function FilterMenu({ x, y, axisName, band, slotId, onSet, onClear, onClose }: {
    x: number; y: number; axisName: string; band: RankBand | undefined; slotId: string;
    onSet: (edge: "lo" | "hi") => void; onClear: () => void; onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const h = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
        return () => { clearTimeout(id); document.removeEventListener("mousedown", h); };
    }, [onClose]);
    const isLo = band?.lo === slotId, isHi = band?.hi === slotId;
    const pos = useClampedPos(x, y, ref);
    const item: CSSProperties = { display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", fontSize: 12.5, padding: "7px 12px" };
    return createPortal(
        <div ref={ref} style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 60, minWidth: 160, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.24)", overflow: "hidden" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", padding: "8px 12px 4px" }}>{axisName} · 필터 경계</div>
            <button style={item} onClick={() => onSet("lo")}><span style={{ color: FILTER, fontWeight: 700 }}>▶</span> {isLo ? "이상 경계 해제" : "이상 경계(이 지점부터)"}</button>
            <button style={item} onClick={() => onSet("hi")}><span style={{ color: FILTER, fontWeight: 700 }}>◀</span> {isHi ? "이하 경계 해제" : "이하 경계(이 지점까지)"}</button>
            {(band?.lo || band?.hi) && <button style={{ ...item, borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }} onClick={onClear}>이 축 필터 초기화</button>}
        </div>,
        document.body,
    );
}

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
    const pos = useClampedPos(x, y, ref);
    return createPortal(
        <div ref={ref} style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 60, minWidth: 200, maxWidth: 270, maxHeight: "80vh", overflowY: "auto", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 9, boxShadow: "0 10px 30px rgba(0,0,0,0.24)" }}>
            <div style={{ position: "sticky", top: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-tertiary)", padding: "8px 12px 4px", background: "var(--bg-primary)" }}>{axisName} · 이 자리 {points.length}건{scope === "day" ? " · 하루단위" : ""}</div>
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
        </div>,
        document.body,
    );
}
