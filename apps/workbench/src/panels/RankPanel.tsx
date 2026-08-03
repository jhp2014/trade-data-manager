import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { useWorkbench, type RankBand, type DateRange, type TimeRange } from "../store/workbench.js";
import { axisLinesQuery, allPointsQuery, rankAxesQuery } from "../api/queries.js";
import { placePoint, unplacePoint, createRankAxis, renameRankAxis, deleteRankAxis, type RankPoint, type RankTarget } from "../api/rank.js";
import { useRankAxes } from "../lib/useRankAxes.js";
import { PAD, LINE_PAD, assemble, computeLaneDrop, displayU, isZoomed, slotFrac, zoomAt, type Slot, type View } from "./rank/rankGeometry.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { pointKey, pointKeyOf, parsePointKey } from "../lib/pointKey.js";
import { Sep } from "../components/ControlChrome.js";
import { AnchoredPopover } from "../ui/Dialog.js";
import { SavedFilterControls } from "./rank/SavedFilterControls.js";
import { TagFilterLine, AddTagFilterButton } from "./rank/TagFilterLine.js";
import { RankFilterBar } from "./rank/RankFilterBar.js";
import { AxisBoundMenu } from "./rank/AxisBoundMenu.js";
import { FilterRail } from "./rank/FilterRail.js";
import { ComputedAxisRail } from "./rank/ComputedAxisRail.js";
import { isComputedAxis, formatAxisValue } from "../lib/computedAxis.js";
import { ACTIVE, ACTIVE_SOFT, CurrentMarker, FILTER, HOVER, HOVER_SOFT, LABEL_W, RangeBracket, ScaleEnd, SortBadge } from "./rank/rankRailChrome.js";
import type { RankAxis } from "@trade-data-manager/wire";

// 현재 타점 위치 마커(2D 물방울 핀) 애니메이션 — 전환 시 드롭 1회 + 미세 부유. 화면에 하나뿐이라 과하지 않음.
const PIN_KF_ID = "rank-cur-pin-kf";
if (typeof document !== "undefined" && !document.getElementById(PIN_KF_ID)) {
    const st = document.createElement("style");
    st.id = PIN_KF_ID;
    st.textContent = "@keyframes rankCurDrop{0%{transform:translate(-50%,-13px);opacity:0}55%{opacity:1}100%{transform:translate(-50%,0)}}@keyframes rankCurBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}.rank-cur-pin{animation:rankCurDrop .42s cubic-bezier(.34,1.56,.64,1)}.rank-cur-pin>svg{display:block;animation:rankCurBob 1.9s ease-in-out infinite}.rank-tick-bar{transition:height .12s ease,box-shadow .12s ease,background .12s ease}.rank-tick:hover .rank-tick-bar{height:18px!important;background:#f59e0b!important;box-shadow:0 0 0 4px rgba(245,158,11,.28)!important}";
    document.head.appendChild(st);
}

// 순위 배치 보드 — 멀티축 가로 레인. 관례: 오른쪽 = +좋음/강함, 왼쪽 = −나쁨/약함(사용자가 일관 입력).
//  · slot = 순위선 한 위치(타이 = 여러 타점 한 slot). PlacedPoint[](orderKey asc) → slotId 로 묶어 조립.
//  · 활성 타점(현재 종목, focus.activePoint) = 스팟에 핑크 강조, 활성이 배치된 축은 레인 배경 틴트로 구분.
//  · 상단 담기 라인 = 수동 작업셋(현재 타점 + 담은 종목, 같은 UI). 칩을 레인에 드래그해 배치(끝 = +담기). 접기 무관.
//  · 점 클릭 → 그 자리 타점 리스트 팝오버(행 클릭=goToPoint · +담기 · × 이 축 배치해제).
//  · Ctrl+휠 = 커서 지점 확대(레인별) · 더블클릭/⟲ = 원위치 · 그냥 휠 = 세로 스크롤 · 연결 = 활성 프로파일 오버레이.


const ROW_H = 58;
// 시간 레일 도메인 08:00~20:00.
const T0 = 8 * 60, T1 = 20 * 60;
const toMin = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const timeFrac = (hm: string): number => Math.max(0, Math.min(1, (toMin(hm) - T0) / (T1 - T0)));
const fracTime = (f: number): string => { const m = Math.max(T0, Math.min(T1, Math.round((T0 + f * (T1 - T0)) / 5) * 5)); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

interface DropInfo { axisId: string; leftPct: number; tie: boolean; target: RankTarget; }

export function RankPanel(): JSX.Element {
    const activePoint = useWorkbench((s) => s.activePoint);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    // 필터 밴드(분석 대시보드와 공유) — 우클릭으로 이 축 이상/이하 경계 지정.
    const rankBands = useWorkbench((s) => s.rankBands);
    const setRankBound = useWorkbench((s) => s.setRankBound);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const setDateRanges = useWorkbench((s) => s.setDateRanges);
    const setTimeRanges = useWorkbench((s) => s.setTimeRanges);
    const axisValueRanges = useWorkbench((s) => s.axisValueRanges);
    const setAxisValueRanges = useWorkbench((s) => s.setAxisValueRanges);
    // 링크 공유(시트와 양방향) — 호버·축순서.
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);
    const rankSort = useWorkbench((s) => s.rankSort); // 시트 정렬 기준 → 해당 레일 하이라이트 + 배지.
    const [filterMenu, setFilterMenu] = useState<{ axisId: string; slotId: string; x: number; y: number } | null>(null);
    const qc = useQueryClient();

    // 축 목록·배치줄·순서는 시트와 공유(useRankAxes). 여기선 레인이 쓸 slot 묶음으로만 빚는다.
    // 계산 축도 함께 받되 레인이 아니라 **필터 레일**로 그린다 — 배치가 없으니 드롭할 자리도 없다.
    const { axes, linesByAxis: rawLines, computedValues, computedMeta, isLoading: axesLoading, reorder } = useRankAxes({ includeComputed: true });
    const laneAxes = useMemo(() => axes.filter((a) => !isComputedAxis(a.id)), [axes]);
    const railAxes = useMemo(() => axes.filter((a) => isComputedAxis(a.id)), [axes]);
    const linesByAxis = useMemo(() => {
        const m = new Map<string, Slot[]>();
        for (const [axisId, placed] of rawLines) m.set(axisId, assemble(placed));
        return m;
    }, [rawLines]);

    const pointsQ = useQuery(allPointsQuery());
    const nameByCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return m;
    }, [pointsQ.data]);
    const nameOf = (code: string): string => nameByCode.get(code) ?? code;
    // 날짜·시간 레일 도메인 매핑(필터 viz + 드래그 입력).
    const dateBounds = useMemo(() => { const ds = (pointsQ.data ?? []).map((p) => p.date).sort(); return ds.length ? { min: ds[0], max: ds[ds.length - 1] } : null; }, [pointsQ.data]);
    const dayNum = (d: string): number => Date.parse(d + "T00:00:00Z") / 86400000;
    const dateFrac = (d: string): number => { if (!dateBounds) return 0; const a = dayNum(dateBounds.min), b = dayNum(dateBounds.max); return b <= a ? 0 : Math.max(0, Math.min(1, (dayNum(d) - a) / (b - a))); };
    const fracDate = (f: number): string => { if (!dateBounds) return ""; const a = dayNum(dateBounds.min), b = dayNum(dateBounds.max); return new Date(Math.round(a + f * (b - a)) * 86400000).toISOString().slice(0, 10); };

    // 담기(작업셋) = 공유 pinned(시트 핀과 같은 상태). 활성 타점 = focus.activePoint(스팟 강조 + 라인 선두).
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
    const tray = useMemo(() => pinned.map(parsePointKey).filter((p): p is RankPoint => p !== null), [pinned]);
    const inTray = (p: RankPoint): boolean => pinnedSet.has(pointKey(p));
    const addToTray = (p: RankPoint): void => { if (!pinnedSet.has(pointKey(p))) togglePin(pointKey(p)); };
    const removeFromTray = (p: RankPoint): void => togglePin(pointKey(p));
    const activeAsPoint: RankPoint | null = activePoint ? { stockCode: activePoint.code, date: activePoint.date, time: activePoint.time } : null;

    const [views, setViews] = useState<Record<string, View>>({});
    const viewOf = (id: string): View => views[id] ?? { v0: 0, v1: 1 };
    const setView = (id: string, v: View): void => setViews((s) => ({ ...s, [id]: v }));
    const resetView = (id: string): void => setViews((s) => { const n = { ...s }; delete n[id]; return n; });
    const [pop, setPop] = useState<{ axisId: string; slotId: string; x: number; y: number } | null>(null);

    // 활성 타점 키 — ActivePoint 는 필드명이 code 라 pointKeyOf 로 맞춘다(시트의 activeKey 와 같은 문자열).
    const activeKey = activePoint ? pointKeyOf(activePoint.code, activePoint.date, activePoint.time) : null;
    const activeMatches = (p: RankPoint): boolean => activeKey !== null && pointKey(p) === activeKey;

    // 줄 캐시는 전축 한 키 — 어느 축을 만졌든 같은 키를 무효화한다.
    const invLines = (): void => void qc.invalidateQueries({ queryKey: axisLinesQuery().queryKey });
    const invAxes = (): void => void qc.invalidateQueries({ queryKey: rankAxesQuery().queryKey });
    const placeMut = useMutation({ mutationFn: (v: { axisId: string; point: RankPoint; target: RankTarget }) => placePoint(v.axisId, v.point, v.target), onSuccess: () => invLines() });
    const unplaceMut = useMutation({ mutationFn: (v: { axisId: string; point: RankPoint }) => unplacePoint(v.axisId, v.point), onSuccess: () => invLines() });
    const createMut = useMutation({ mutationFn: (v: { name: string; scope: "point" | "day" }) => createRankAxis(v.name, v.scope), onSuccess: invAxes });
    const renameMut = useMutation({ mutationFn: (v: { id: string; name: string }) => renameRankAxis(v.id, v.name), onSuccess: invAxes });
    const deleteMut = useMutation({ mutationFn: (id: string) => deleteRankAxis(id), onSuccess: () => { invAxes(); invLines(); } }); // 축이 사라지면 그 줄도 함께 사라진다

    // ── 드래그(dnd-kit) — 담기 칩 → 레인. 포인터 x 로 목표(타이/between) + 라이브 인디케이터. ──
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const dragStartX = useRef(0);
    const trackRefs = useRef<Map<string, HTMLElement>>(new Map());
    const [drop, setDrop] = useState<DropInfo | null>(null);

    // "저 축 보여줘"(타점 정보 패널의 축 클릭) — 이미 있는 트랙 ref 로 그 레인까지 스크롤. at 이 바뀔 때만 1회.
    const revealAxis = useWorkbench((s) => s.revealAxis);
    useEffect(() => {
        if (!revealAxis) return;
        trackRefs.current.get(revealAxis.axisId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [revealAxis]);

    // DOM 측정만 여기서 — 판정 규칙(타이 ±px·between 이웃)은 rankGeometry(순수, 테스트됨).
    const computeDrop = (axisId: string, clientX: number): DropInfo | null => {
        const el = trackRefs.current.get(axisId);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const drop = computeLaneDrop(linesByAxis.get(axisId) ?? [], viewOf(axisId), clientX - rect.left, rect.width);
        return { axisId, ...drop };
    };

    // 드래그 소스 = 담기 칩(chip:) | 현재 타점(cur:). 현재가 담기에도 있으면 두 요소 공존 → id 네임스페이스로 중복 회피.
    const draggedPoint = (id: unknown): RankPoint | null => {
        if (typeof id !== "string") return null;
        const s = id.startsWith("chip:") ? id.slice(5) : id.startsWith("cur:") ? id.slice(4) : null;
        return s ? parsePointKey(s) : null;
    };
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
                    {/* 저장/불러오기 — 담기 라인 오른쪽 끝에 얹어 새 줄을 안 만든다(상단 세로가 빠듯하다). */}
                    <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, flexShrink: 0 }}>
                        <SavedFilterControls axes={axes} />
                    </span>
                </div>

                <RankFilterBar axes={axes} dateBounds={dateBounds} computedValues={computedValues} computedMeta={computedMeta} extra={<AddTagFilterButton />} />
                <TagFilterLine />

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
                    {axesLoading && <div style={muted}>불러오는 중…</div>}
                    {/* 날짜·시간 필터 레일 — 축 레인 위(시트 열 순서와 통일). 값 스케일·틱+라벨 드래그로 구간 설정/조정. */}
                    {dateBounds && (
                        <FilterRail<string, DateRange> label="날짜" ranges={dateRanges} toFrac={dateFrac} fromFrac={fracDate} fmt={(v) => v.slice(2).replace(/-/g, ".")}
                            minLabel={dateBounds.min.slice(2).replace(/-/g, ".")} maxLabel={dateBounds.max.slice(2).replace(/-/g, ".")} marker={activePoint?.date ?? null}
                            sortDir={rankSort?.target === "date" ? rankSort.dir : null} onChange={setDateRanges} />
                    )}
                    <FilterRail<string, TimeRange> label="시간" ranges={timeRanges} toFrac={timeFrac} fromFrac={fracTime} fmt={(v) => v}
                        minLabel="08:00" maxLabel="20:00" marker={activePoint ? activePoint.time.slice(0, 5) : null}
                        sortDir={rankSort?.target === "time" ? rankSort.dir : null} onChange={setTimeRanges} />
                    {/* 계산 축 레일 — 날짜·시간과 같은 조작(빈 트랙 드래그=구간, 라벨 드래그=조정). 틱 = 실제 타점 자리. */}
                    {railAxes.map((ax) => (
                        <ComputedAxisRail key={ax.id} name={ax.name}
                            values={computedValues.get(ax.id) ?? new Map()}
                            strongerWhen={computedMeta.get(ax.id)?.strongerWhen ?? "higher"}
                            fmtValue={computedMeta.get(ax.id)?.fmt ?? formatAxisValue}
                            ranges={axisValueRanges[ax.id] ?? []}
                            markerKey={activeKey}
                            sortDir={rankSort?.target === ax.id ? rankSort.dir : null}
                            onChange={(r) => setAxisValueRanges(ax.id, r)} />
                    ))}
                    <div style={{ position: "relative" }}>
                        {laneAxes.map((ax) => {
                            const slots = linesByAxis.get(ax.id) ?? [];
                            return (
                                <Lane
                                    key={ax.id}
                                    axis={ax} slots={slots} view={viewOf(ax.id)}
                                    setView={(v) => setView(ax.id, v)} resetView={() => resetView(ax.id)}
                                    registerTrack={(el) => { if (el) trackRefs.current.set(ax.id, el); else trackRefs.current.delete(ax.id); }}
                                    activeMatches={activeMatches} sortDir={rankSort?.target === ax.id ? rankSort.dir : null}
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
                return (
                    <AxisBoundMenu anchor={filterMenu} axisName={ax.name} band={rankBands[filterMenu.axisId]} slotId={filterMenu.slotId}
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

// ── 담기 라인(작업셋) — [현재 선택 칩] │ [담은 종목 칩…] [+담기]. 남은 폭에서 가로 스크롤.
//    현재 선택도 드래그 소스(레인에 배치), 담기와 | 로 구분. 현재가 담기에도 있으면 양쪽 중복 표시(의도).
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
                    <CurrentChip point={current} name={nameOf(current.stockCode)} onGo={() => onGo(current)} />
                    <Sep />
                </>
            )}
            {tray.map((p) => <PointItem key={pointKey(p)} point={p} name={nameOf(p.stockCode)} active={activeMatches(p)} onGo={() => onGo(p)} onRemove={() => onRemove(p)} />)}
            <button onClick={onAddActive} disabled={!canAdd} title={canAdd ? "현재 타점을 담기" : "담을 새 타점을 선택하세요"}
                style={{ flexShrink: 0, border: `1px dashed ${canAdd ? ACTIVE : "var(--border-default)"}`, borderRadius: 4, background: "transparent", color: canAdd ? ACTIVE : "var(--text-tertiary)", cursor: canAdd ? "pointer" : "default", opacity: canAdd ? 1 : 0.5, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", whiteSpace: "nowrap" }}>+ 담기</button>
        </div>
    );
}

// 담기 라인 항목 — 드래그 소스(칩 전체가 손잡이, 그랩 아이콘 없음). 이름 클릭=이동, × 빼기(둘 다 pointerdown 차단해 드래그와 분리).
//  칩 전체 클릭=이동, 4px 이상 끌면 드래그(dnd distance 4 자동구분). × 만 pointerdown stop(× 에서 드래그 시작 안 되게).
function PointItem({ point, name, active, onGo, onRemove }: { point: RankPoint; name: string; active: boolean; onGo: () => void; onRemove?: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${pointKey(point)}` });
    const stop = (e: ReactPointerEvent): void => e.stopPropagation();
    return (
        <span ref={setNodeRef} {...listeners} {...attributes} onClick={onGo} title="드래그해 레인에 배치 · 클릭=이동"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 6px", borderRadius: 4, border: `1px solid ${active ? ACTIVE : "var(--border-default)"}`, background: "var(--bg-tertiary)", cursor: "grab", touchAction: "none", opacity: isDragging ? 0.4 : 1, whiteSpace: "nowrap" }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, width: 70, minWidth: 0, overflow: "hidden" }}>
                <span title={name} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{point.date.slice(5)} {point.time.slice(0, 5)}</span>
            </span>
            {onRemove && <button onPointerDown={stop} onClick={(e) => { e.stopPropagation(); onRemove(); }} title="담기에서 빼기" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", padding: "0 1px", fontSize: 13, lineHeight: 1 }}>×</button>}
        </span>
    );
}

// 현재 타점 칩 — 담기 라인 선두. 담기 칩과 같은 드래그 소스지만 id 는 cur:{pk}(현재∈담기 중복 회피).
//  전체(점+이름)가 손잡이. 그냥 클릭(이동 없음)=이동 — dnd distance 4 가 클릭/드래그를 자동 구분하므로 onClick·드래그 공존.
function CurrentChip({ point, name, onGo }: { point: RankPoint; name: string; onGo: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `cur:${pointKey(point)}` });
    return (
        <span ref={setNodeRef} {...listeners} {...attributes} onClick={onGo} title="현재 타점 — 드래그해 레인에 배치 · 클릭=이동"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, cursor: "grab", touchAction: "none", opacity: isDragging ? 0.4 : 1, whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACTIVE, flexShrink: 0 }} />
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, width: 80, minWidth: 0, overflow: "hidden" }}>
                <span title={name} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{point.date.slice(5)} {point.time.slice(0, 5)}</span>
            </span>
        </span>
    );
}

// ── 한 축 레인 ─────────────────────────────────────────────────────────────
function Lane({
    axis, slots, view, setView, resetView, registerTrack, activeMatches, sortDir, hoveredKey, onHoverKey, drop, nameOf, band,
    onNodeClick, onNodeContext, onRename, onDelete, onReorderDrop,
}: {
    axis: RankAxis; slots: Slot[]; view: View; setView: (v: View) => void; resetView: () => void;
    registerTrack: (el: HTMLElement | null) => void;
    activeMatches: (p: RankPoint) => boolean; sortDir: 1 | -1 | null;
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
            setView(zoomAt(view, t, e.deltaY));
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
            style={{ position: "relative", height: ROW_H, borderTop: reorderOver ? "2px solid var(--accent-primary)" : "2px solid transparent", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", background: sortDir != null ? "var(--bg-secondary)" : "transparent" }}
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
                        {sortDir != null && <SortBadge dir={sortDir} />}
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
                    const hasHover = slot.points.some((p) => hoveredKey === pointKey(p));
                    const tie = slot.points.length > 1;
                    const left = `calc(${PAD}px + ${u} * (100% - ${2 * PAD}px))`;
                    // 스팟 = 수직 틱(날짜/시간 레일과 통일). 현재=위치 마커(아이콘)+파랑 틱, 호버(시트 링크)=앰버 틱+글로우+굵게. 타이는 별도 표기 없음(클릭=목록 팝오버).
                    const barBg = hasActive ? ACTIVE : hasHover ? HOVER : "var(--text-secondary)";
                    const glow = hasHover ? `0 0 0 4px ${HOVER_SOFT}` : "none";
                    return (
                        <div key={slot.slotId} className="rank-tick" onClick={(e) => onNodeClick(slot.slotId, e.clientX, e.clientY)}
                            onContextMenu={(e) => { e.preventDefault(); onNodeContext(slot.slotId, e.clientX, e.clientY); }}
                            onMouseEnter={() => onHoverKey(pointKey(slot.points[0]))} onMouseLeave={() => onHoverKey(null)}
                            title={tie ? `타이 ${slot.points.length}건 — 클릭 / 우클릭=필터 경계` : `${nameOf(slot.points[0].stockCode)} — 클릭 / 우클릭=필터 경계`}
                            style={{ position: "absolute", left, top: "50%", transform: "translate(-50%,-50%)", width: 18, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: hasActive ? 5 : 2 }}>
                            {hasActive && <CurrentMarker color={ACTIVE} />}
                            <span className="rank-tick-bar" style={{ width: 3, height: hasHover ? 18 : 14, borderRadius: 1.5, background: barBg, boxShadow: glow }} />
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
    // 높이 상한 50vh — 타이가 쌓여도 팝오버가 화면을 덮지 않고 안에서 스크롤(헤더는 sticky 라 계속 보인다).
    return (
        <AnchoredPopover anchor={{ x, y }} onClose={onClose} minWidth={200} maxWidth={270} maxHeight="50vh" padding={0} placement="beside">
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
        </AnchoredPopover>
    );
}
