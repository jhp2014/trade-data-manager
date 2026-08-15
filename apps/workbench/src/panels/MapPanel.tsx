// 그룹 맵 — **그룹 사이의 구조를 보고, 탐색 후보를 재는 평면.**
//
// 맵은 깔때기의 여느 구독자다(읽기): 모집단 = "지금 보는 집합"(짚은 칸 반영, 없으면 최종 생존)이고,
// 노드 숫자·겹침 선이 전부 그 기준이다 — 골격·시트와 같은 잣대. 그리고 쓰기는 단 하나, 짚은 그룹을
// **필터에 추가**(addFilterStage 한 번)뿐이다. 맵은 그 단계를 만든 뒤 잊는다 — 지우기·순서·on/off 는
// 필터 보드의 일이고, 그래서 "탐색하다 실수로 조건을 만들었다"가 원리적으로 없다.
//
// 구조(포함관계)는 **영역**으로 그린다: 컨테이너 자리·크기는 자식들에서 유도(mapLayout), 부모 지정은
// 노드를 영역 안에 떨어뜨리는 드래그다(dropTargetAt — 안에 있음 = 하위다, 시각과 의미가 같다).
// 겹침(징검다리) 선은 짚은 그룹의 것만 — 전부 그리면 실뭉치가 된다. 조상–자손 쌍은 안 그린다(포함은
// 영역으로 이미 보인다).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Background,
    MarkerType,
    ReactFlow,
    ReactFlowProvider,
    applyNodeChanges,
    useReactFlow,
    type Edge,
    type Node,
    type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mapsQuery, groupsQuery } from "../api/queries.js";
import { useStockNames } from "../lib/useStockNames.js";
import { createMap, type MapScope } from "../api/map.js";
import { createGroup, moveGroups, placeGroup, setGroupParent, unplaceGroup, type Group, type GroupMembership, type GroupMove } from "../api/groups.js";
import { useGroups } from "../lib/GroupsContext.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { shortDate } from "../lib/date.js";
import { ACTIVE } from "../styles/palette.js";
import { GROUP_NODE_TYPE, MAP_NODE_TYPES, type GroupNodeData } from "./map/MapNodes.js";
import { bridgeArrows, groupsOnMap, overlaps, placeableGroups, populationCounts, populationFeed, populationMembersOf, type PopulationItem } from "./map/mapView.js";
import { chartKey } from "../lib/pointKey.js";
import { absCenterOf, dropTargetAt, layoutMap, leafSize } from "./map/mapLayout.js";

const SELECTED_KEY = "wb.mapSelected";
const LIST_KEY = "wb.mapMemberList";
/** 겹침 숫자 크기 범위 — 이 선택 안의 최댓값이 최대 크기(상대 척도). 정확한 값은 숫자 자체가 준다. */
const LABEL_MIN_PX = 11;
const LABEL_MAX_PX = 18;

export function MapPanel(): JSX.Element {
    return (
        <ReactFlowProvider>
            <MapPanelInner />
        </ReactFlowProvider>
    );
}

type MapNode = Node<GroupNodeData, typeof GROUP_NODE_TYPE>;

function MapPanelInner(): JSX.Element {
    const mapsQ = useQuery(mapsQuery());
    const gv = useGroups();
    const funnel = useFunnel();
    const qc = useQueryClient();
    const { fitView, screenToFlowPosition } = useReactFlow();
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const maps = mapsQ.data ?? [];
    const [savedId, setSavedId] = usePersistedState<string | null>(SELECTED_KEY, (o) => (typeof o === "string" ? o : null), null);
    const activeMap = maps.find((m) => m.id === savedId) ?? maps[0] ?? null;

    const onMap = useMemo(() => (activeMap ? groupsOnMap(gv.groups, activeMap.id) : []), [gv.groups, activeMap]);
    const offMap = useMemo(() => (activeMap ? placeableGroups(gv.groups, activeMap.scope) : []), [gv.groups, activeMap]);
    const onMapIds = useMemo(() => new Set(onMap.map((g) => g.id)), [onMap]);

    // ── 모집단 — 깔때기 "보는 집합"을 **이 평면의 층위로** 맞춰 본다.
    // ⚠ 깔때기 해상도(자동)는 걸린 조건이 정하지 평면이 정하지 않는다. 그대로 쓰면 타점 평면인데 해상도가
    // 하루일 때 타점 소속이 하루 항목에 안 걸려 **전 노드가 0**이 된다(실측된 결함). 그래서 타점 평면은
    // viewedPointRefs(하루 항목이 그날 타점 전부로 펼쳐진 것), 하루 평면은 차트 단위로 접어서 센다 —
    // FunnelView 가 두 투영을 이미 계약으로 내주는 이유가 이것이다.
    const population = useMemo<PopulationItem[]>(() => {
        if (funnel.isLoading) return [];
        if (activeMap?.scope === "point") return funnel.viewedPointRefs;
        const seen = new Set<string>();
        const out: PopulationItem[] = [];
        for (const it of funnel.viewedItems) {
            const k = chartKey(it);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ stockCode: it.stockCode, date: it.date });
        }
        return out;
    }, [funnel.isLoading, funnel.viewedItems, funnel.viewedPointRefs, activeMap?.scope]);

    const popFeed = useMemo<GroupMembership[]>(
        () => populationFeed(population, (i) => gv.appliedGroupIdsOf(i)),
        [population, gv],
    );
    const counts = useMemo(() => populationCounts(popFeed), [popFeed]);

    const [picked, setPicked] = useState<string | null>(null); // 짚은 그룹 — 세션 시선(조건이 아니다)
    const [showList, setShowList] = usePersistedState<boolean>(LIST_KEY, (o) => (typeof o === "boolean" ? o : null), false);
    const pickedGroup = picked === null ? null : (gv.groupById.get(picked) ?? null);
    useEffect(() => { if (picked !== null && !onMapIds.has(picked)) setPicked(null); }, [picked, onMapIds]);

    // ── 겹침(징검다리) — 짚은 그룹의 것만, 조상–자손 쌍 제외.
    const bridges = useMemo(
        () => (picked === null ? [] : overlaps(popFeed, { within: onMapIds, only: picked, groupById: gv.groupById })),
        [picked, popFeed, onMapIds, gv.groupById],
    );
    const bridgeCountOf = useMemo(() => {
        const m = new Map<string, number>();
        for (const b of bridges) m.set(b.aId === picked ? b.bId : b.aId, b.count);
        return m;
    }, [bridges, picked]);

    // ── 레이아웃 — 컨테이너 좌표 계산은 전부 mapLayout(순수). laid 는 드래그 판정·역변환도 쓴다.
    // 잎 크기는 **이름**에서만 나온다(수는 고정 칸 — 필터로 수가 바뀔 때 상자가 들썩이지 않게).
    const laid = useMemo(
        () => layoutMap(onMap.map((g) => {
            const s = leafSize(g.name);
            return { id: g.id, parentId: g.parentId, x: g.x ?? 0, y: g.y ?? 0, w: s.w, h: s.h };
        })),
        [onMap],
    );
    const laidById = useMemo(() => new Map(laid.map((n) => [n.id, n])), [laid]);

    /**
     * 겹침 선 — **짚은 그룹에서 나가는 화살표**. 겹침 자체는 대칭이라 방향은 데이터가 아니라 시선이다
     * (다른 그룹을 짚으면 통째로 뒤집힌다). 굵기는 전부 같고 **숫자 크기**가 겹침 수를 나른다 —
     * 두께와 숫자는 같은 값을 두 번 말하는 것이었고, 정확한 값은 숫자가 이미 준다.
     * 크기는 짚은 그룹 **안에서의 상대**(최댓값이 최대 크기) — 절대 척도면 다들 고만고만해 안 갈린다.
     * 붙는 변은 두 상자의 상대 위치가 정한다(sidesBetween) — 그래야 곡선이 변의 법선으로 빠져나간다.
     */
    const { arrows, anchorsById } = useMemo(() => {
        const { arrows, anchors } = bridgeArrows(bridges, picked, (id) => laidById.get(id)?.abs);
        return { arrows, anchorsById: anchors };
    }, [bridges, picked, laidById]);

    const edges = useMemo<Edge[]>(
        () =>
            arrows.map((a) => ({
                id: a.id,
                source: a.from,
                target: a.to,
                sourceHandle: `${a.fromSide}-s`,
                targetHandle: `${a.toSide}-t`,
                label: String(a.count),
                markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11, color: "var(--text-muted)" },
                style: { stroke: "var(--text-muted)", strokeWidth: 1.5, opacity: 0.65 },
                labelShowBg: false,
                labelStyle: { fontSize: LABEL_MIN_PX + (LABEL_MAX_PX - LABEL_MIN_PX) * a.weight, fill: "var(--text-primary)" },
            })),
        [arrows],
    );

    const derived = useMemo<MapNode[]>(
        () =>
            laid.map((n) => {
                const g = gv.groupById.get(n.id)!;
                const count = counts.get(n.id) ?? 0;
                const dimmed = picked !== null ? n.id !== picked && !bridgeCountOf.has(n.id) : count === 0 && funnel.isFiltering;
                return {
                    id: n.id,
                    type: GROUP_NODE_TYPE,
                    position: n.position,
                    ...(n.parentId !== undefined ? { parentId: n.parentId } : {}),
                    zIndex: n.depth,
                    style: { width: n.width, height: n.height },
                    data: {
                        group: g, count, container: n.container,
                        anchors: anchorsById.get(n.id) ?? [],
                        dimmed, picked: picked === n.id,
                    },
                };
            }),
        [laid, gv.groupById, counts, anchorsById, picked, bridgeCountOf, funnel.isFiltering],
    );

    const [nodes, setNodes] = useState<MapNode[]>([]);
    useEffect(() => { setNodes(derived); }, [derived]);
    const onNodesChange = useCallback((cs: NodeChange<MapNode>[]) => setNodes((ns) => applyNodeChanges(cs, ns)), []);

    // ── 쓰기 ──────────────────────────────────────────────────────────────
    const invalidateGroups = useCallback(() => void qc.invalidateQueries({ queryKey: groupsQuery().queryKey }), [qc]);

    const moveMut = useMutation({
        mutationFn: (moves: GroupMove[]) => moveGroups(moves),
        onError: invalidateGroups, // 낙관 갱신이 거짓이 된 채 남지 않게
    });
    const parentMut = useMutation({
        mutationFn: (v: { id: string; parentId: string | null }) => setGroupParent(v.id, v.parentId),
        onSuccess: invalidateGroups,
        onError: (e: Error) => { window.alert(e.message); invalidateGroups(); }, // 순환 등은 서버가 막는다 — 이유를 보여준다
    });
    const placeMut = useMutation({
        mutationFn: (v: { id: string; mapId: string; x: number; y: number }) => placeGroup(v.id, v.mapId, v.x, v.y),
        onSuccess: invalidateGroups,
    });
    const unplaceMut = useMutation({ mutationFn: (id: string) => unplaceGroup(id), onSuccess: invalidateGroups });
    const createMapMut = useMutation({
        mutationFn: (v: { name: string; scope: MapScope }) => createMap(v.name, v.scope),
        onSuccess: (m) => {
            setSavedId(m.id);
            void qc.invalidateQueries({ queryKey: mapsQuery().queryKey });
        },
    });
    const createGroupMut = useMutation({
        mutationFn: (v: { name: string; scope: MapScope }) => createGroup(v.name, v.scope),
        onSuccess: async (g) => {
            if (!activeMap) return;
            const c = viewCenter(); // 만들자마자 **보이는 자리**에 — (0,0) 고정은 겹쳐 쌓인다
            await placeGroup(g.id, activeMap.id, c.x, c.y);
            invalidateGroups();
        },
    });

    /** 지금 보이는 화면의 가운데(flow 좌표) — 새 그룹·올리기의 착지점. */
    const viewCenter = useCallback((): { x: number; y: number } => {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }, [screenToFlowPosition]);

    /** id 의 자손 전부(맵 위) — 컨테이너를 끌면 자식 절대좌표도 함께 움직인 것이라 같이 커밋해야 한다. */
    const descendantsOf = useCallback((id: string): Group[] => {
        const out: Group[] = [];
        let frontier = [id];
        while (frontier.length > 0) {
            const next = onMap.filter((g) => g.parentId !== null && frontier.includes(g.parentId));
            out.push(...next);
            frontier = next.map((g) => g.id);
            if (out.length > onMap.length) break; // 순환 방어(저장 경로가 막지만 옛 데이터 대비)
        }
        return out;
    }, [onMap]);

    /**
     * 드래그 끝 — 끌던 노드들의 이동 delta 를 절대좌표로 되돌려 커밋하고(자손 포함 — 컨테이너의 자식은
     * RF 상대좌표가 그대로라 저장 좌표를 직접 밀어야 다음 렌더에서 제자리가 유지된다), 떨어진 자리가
     * 다른 그룹의 영역이면 부모를 바꾼다. 좌표 커밋은 한 번에(부분 실패 방지, moveGroups 규약).
     * ⚠ setState 업데이터 밖에서 처리한다 — 업데이터 안의 mutate 는 StrictMode 에서 두 번 발사된다.
     */
    const onNodeDragStop = useCallback(
        (_e: unknown, node: MapNode, dragged: MapNode[]) => {
            const moves: GroupMove[] = [];
            for (const d of dragged.length > 0 ? dragged : [node]) {
                const before = laid.find((n) => n.id === d.id);
                if (!before) continue;
                const parent = before.parentId !== undefined ? laid.find((n) => n.id === before.parentId) : undefined;
                const newAbs = { x: (parent?.abs.x ?? 0) + d.position.x, y: (parent?.abs.y ?? 0) + d.position.y };
                const dx = newAbs.x - before.abs.x;
                const dy = newAbs.y - before.abs.y;
                if (dx === 0 && dy === 0) continue;
                for (const g of [gv.groupById.get(d.id), ...descendantsOf(d.id)]) {
                    if (!g || g.x === null || g.y === null) continue;
                    moves.push({ id: g.id, x: g.x + dx, y: g.y + dy });
                }
            }
            if (moves.length > 0) {
                qc.setQueryData<Group[]>(groupsQuery().queryKey, (list) =>
                    list?.map((g) => {
                        const m = moves.find((v) => v.id === g.id);
                        return m ? { ...g, x: m.x, y: m.y } : g;
                    }),
                );
                moveMut.mutate(moves);
            }
            // 부모 판정은 끌던 노드만 — 떨어진 절대 중심이 어느 영역 안인가(제 자손은 후보에서 빠진다).
            const center = absCenterOf(laid, node.id, node.position);
            if (center) {
                const target = dropTargetAt(laid, center, node.id);
                const currentParent = gv.groupById.get(node.id)?.parentId ?? null;
                if (target !== currentParent) parentMut.mutate({ id: node.id, parentId: target });
            }
        },
        [laid, gv.groupById, descendantsOf, qc, moveMut, parentMut],
    );

    const addFilterStage = useWorkbench((s) => s.addFilterStage);
    const addToFilter = useCallback(
        (groupId: string) => addFilterStage([{ kind: "group", expr: { groups: [{ literals: [{ groupId, neg: false }] }] } }]),
        [addFilterStage],
    );

    // ── 렌더 ──────────────────────────────────────────────────────────────
    if (mapsQ.isPending || gv.isLoading) return <Note>불러오는 중…</Note>;
    if (mapsQ.isError) return <Note>평면을 불러오지 못했습니다: {(mapsQ.error as Error).message}</Note>;
    if (maps.length === 0) return <CreateMap onCreate={(name, scope) => createMapMut.mutate({ name, scope })} busy={createMapMut.isPending} />;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
            <PanelHeader chrome={false} padding="5px 8px" style={{ borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                <select value={activeMap?.id ?? ""} onChange={(e) => { setSavedId(e.target.value); setPicked(null); }} style={{ fontSize: 12 }}>
                    {maps.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} [{m.scope === "day" ? "하루" : "타점"}]</option>
                    ))}
                </select>
                <button onClick={() => fitView({ duration: 250 })} title="전부 화면에 담기">원위치</button>
                <NewGroup busy={createGroupMut.isPending} onCreate={(name) => activeMap && createGroupMut.mutate({ name, scope: activeMap.scope })} />
                {offMap.length > 0 && activeMap && (
                    <PlacePalette
                        groups={offMap}
                        onPlace={(id) => { const c = viewCenter(); placeMut.mutate({ id, mapId: activeMap.id, x: c.x, y: c.y }); }}
                    />
                )}
                <button onClick={() => setShowList(!showList)} title="짚은 그룹의 모집단 멤버 목록"
                    style={{ color: showList ? ACTIVE : undefined }}>목록</button>
                <span style={{ color: "var(--text-tertiary)", flexShrink: 0, marginLeft: "auto" }}>
                    모집단 {funnel.isLoading ? "…" : popFeed.length}{funnel.isFiltering ? "" : " (전체)"}
                </span>
            </PanelHeader>

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div ref={wrapRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                    <ReactFlow<MapNode>
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        nodeTypes={MAP_NODE_TYPES}
                        nodesConnectable={false}
                        edgesFocusable={false}
                        minZoom={0.05}
                        maxZoom={4}
                        proOptions={{ hideAttribution: true }}
                        onNodeDragStop={onNodeDragStop}
                        onNodeClick={(_e, n) => setPicked((cur) => (cur === n.id ? null : n.id))}
                        onPaneClick={() => setPicked(null)}
                    >
                        <Background gap={40} size={1} />
                    </ReactFlow>

                    {onMap.length === 0 && (
                        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "var(--text-tertiary)" }}>
                            그룹을 만들거나 "올리기"에서 올리세요
                        </div>
                    )}

                    {pickedGroup && (
                        <PickedBar
                            path={gv.pathLabel(pickedGroup.id, pickedGroup.name)}
                            count={counts.get(pickedGroup.id) ?? 0}
                            onAddFilter={() => addToFilter(pickedGroup.id)}
                            onUnplace={() => { unplaceMut.mutate(pickedGroup.id); setPicked(null); }}
                        />
                    )}
                </div>

                {showList && (
                    <MemberList picked={pickedGroup} feed={popFeed} totalOf={(id) => gv.countOf(id)} />
                )}
            </div>
        </div>
    );
}

/** 짚은 그룹의 작업줄 — 맵의 **유일한 쓰기**(필터에 추가)와 배치 해제가 여기 모인다. */
function PickedBar({ path, count, onAddFilter, onUnplace }: {
    path: string; count: number;
    onAddFilter: () => void; onUnplace: () => void;
}): JSX.Element {
    return (
        <div style={{
            position: "absolute", left: 8, bottom: 8, zIndex: 10,
            display: "flex", alignItems: "center", gap: 8, padding: "5px 9px",
            background: "var(--bg-primary)", border: "1px solid var(--border-strong)", borderRadius: 7,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)", fontSize: 12,
        }}>
            <span style={{ fontWeight: 600 }} title={path}>{path}</span>
            <span style={{ color: "var(--text-tertiary)" }}>모집단 {count}</span>
            <button onClick={onAddFilter} title="이 그룹을 필터 단계로 추가 — 지우기·수정은 필터 보드에서"
                style={{ color: ACTIVE, fontWeight: 600 }}>필터에 추가</button>
            <button onClick={onUnplace} title="평면에서 내린다(그룹은 남는다)">내리기</button>
        </div>
    );
}

/** 안 올린 그룹 팔레트 — 헤더의 작은 팝오버. 올리면 화면 가운데에 놓인다. */
function PlacePalette({ groups, onPlace }: { groups: Group[]; onPlace: (id: string) => void }): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
        <span style={{ position: "relative" }}>
            <button onClick={() => setOpen((v) => !v)} style={{ color: open ? ACTIVE : undefined }}>올리기 {groups.length}</button>
            {open && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 20, minWidth: 150, maxHeight: 240, overflowY: "auto",
                    background: "var(--bg-primary)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: 4,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                }}>
                    {groups.map((g) => (
                        <button key={g.id} onClick={() => { onPlace(g.id); setOpen(false); }}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "3px 7px", fontSize: 12, border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}>
                            {g.name}
                        </button>
                    ))}
                </div>
            )}
        </span>
    );
}

/**
 * 짚은 그룹의 모집단 멤버 목록(토글) — 행 클릭 = 그 항목으로 이동(타점이면 goToPoint, 하루면 goToDay).
 * 맵이 탐색의 출발점이 되는 자리다. 숫자는 노드와 같은 잣대(모집단), 전체 부착 수는 참고로만.
 */
function MemberList({ picked, feed, totalOf }: {
    picked: Group | null;
    feed: readonly GroupMembership[];
    totalOf: (groupId: string) => number;
}): JSX.Element {
    const { nameOf } = useStockNames();
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);
    const members = useMemo(() => (picked ? populationMembersOf(feed, picked.id) : []), [feed, picked]);

    return (
        <div style={{ width: 200, flex: "none", borderLeft: "1px solid var(--border-default)", overflowY: "auto", fontSize: 11 }}>
            {picked === null ? (
                <div style={{ padding: 8, color: "var(--text-tertiary)" }}>그룹을 짚으면 모집단 멤버가 보입니다</div>
            ) : (
                <div>
                    <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-default)" }}>
                        <div style={{ fontSize: 12 }}>{picked.name}</div>
                        <div style={{ color: "var(--text-tertiary)" }}>모집단 {members.length} · 전체 부착 {totalOf(picked.id)}</div>
                    </div>
                    {members.slice(0, 300).map((m) => (
                        <button
                            key={`${m.stockCode}|${m.date}|${m.time ?? ""}`}
                            onClick={() => (m.time !== undefined
                                ? goToPoint({ code: m.stockCode, date: m.date, time: m.time })
                                : goToDay({ code: m.stockCode, date: m.date }))}
                            title="이 항목으로 이동"
                            style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 6, padding: "2px 8px", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "inherit", textAlign: "left" }}
                        >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m.stockCode)}</span>
                            <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{shortDate(m.date)}{m.time ? ` ${m.time.slice(0, 5)}` : ""}</span>
                        </button>
                    ))}
                    {members.length > 300 && <div style={{ padding: "2px 8px", color: "var(--text-tertiary)" }}>…외 {members.length - 300}건</div>}
                </div>
            )}
        </div>
    );
}

function NewGroup({ onCreate, busy }: { onCreate: (name: string) => void; busy: boolean }): JSX.Element {
    const [name, setName] = useState("");
    const ref = useRef<HTMLInputElement | null>(null);
    const submit = (): void => {
        const n = name.trim();
        if (n === "") return;
        onCreate(n);
        setName("");
        ref.current?.focus();
    };
    return (
        <span style={{ display: "inline-flex", gap: 3 }}>
            <input
                ref={ref}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="새 그룹"
                style={{ fontSize: 11, width: 90 }}
            />
            <button disabled={busy || name.trim() === ""} onClick={submit}>추가</button>
        </span>
    );
}

function Note({ children }: { children: ReactNode }): JSX.Element {
    return <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}

/** 평면이 하나도 없을 때 — scope 는 만든 뒤 못 바꾼다(올릴 수 있는 그룹의 층위가 곧 평면의 정체). */
function CreateMap({ onCreate, busy }: { onCreate: (name: string, scope: MapScope) => void; busy: boolean }): JSX.Element {
    const [name, setName] = useState("일봉");
    const [scope, setScope] = useState<MapScope>("day");
    return (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
            <div style={{ color: "var(--text-tertiary)" }}>평면이 없습니다. 한 장 만들고 시작하세요.</div>
            <div style={{ display: "flex", gap: 6 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="평면 이름" style={{ fontSize: 12, width: 120 }} />
                <select value={scope} onChange={(e) => setScope(e.target.value as MapScope)} style={{ fontSize: 12 }}>
                    <option value="day">하루 그룹 (종목·날짜)</option>
                    <option value="point">타점 그룹 (종목·날짜·시각)</option>
                </select>
                <button disabled={busy || name.trim() === ""} onClick={() => onCreate(name.trim(), scope)}>만들기</button>
            </div>
        </div>
    );
}
