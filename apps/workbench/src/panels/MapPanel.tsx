// 유사도 맵 — **그룹 사이의 구조를 보는 평면**.
//
// 점은 항목이 아니라 그룹이다. 종목·날짜를 낱개로 흩뿌리면 모든 쌍에 거리가 생기는데 실제로 주장하려던
// 건 일부 이웃 관계뿐이고, 나머지는 나중에 의미로 오독되는 부산물이다. 묶고 쪼개는 판단은 골격 패널에서
// 형태를 보며 하고(닮은 골격이 한눈에 보인다), 여기서는 그 결과의 관계만 본다.
//
// 의미는 **명시적인 것**에 있다: 중첩(그룹 안 그룹)과 겹침(징검다리). 위치는 시각화용이다 —
// 붙여 놓은 둘은 "닮았다"는 주장이지만 멀리 있는 둘은 "안 닮았다"가 아니라 아직 아무 말도 안 한 것이다.
//
// ⚠ 겹침 엣지는 **선택한 그룹의 것만** 그린다. 전부 그리면 그룹이 늘수록 실뭉치가 되고, 평소엔 깨끗하되
// 짚으면 그 그룹의 관계가 드러나는 쪽이 읽기 좋다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Background,
    Controls,
    MiniMap,
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
import { createGroup, moveGroups, placeGroup, setGroupParent, unplaceGroup, type Group } from "../api/groups.js";
import { useGroups } from "../lib/GroupsContext.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { usePersistedState } from "../store/persist.js";
import { ACTIVE } from "../styles/palette.js";
import { MAP_NODE_TYPES, type GroupNodeData } from "./map/MapNodes.js";
import { childrenOf, depthOf, groupsOnMap, memberCounts, membersOf, overlaps, placeableGroups } from "./map/mapView.js";

const SELECTED_KEY = "wb.mapSelected";
/** 저장 좌표를 노드의 **중심**으로 — 겹침 엣지가 노드 가운데를 잇게. */
const NODE_ORIGIN: [number, number] = [0.5, 0.5];

export function MapPanel(): JSX.Element {
    return (
        <ReactFlowProvider>
            <MapPanelInner />
        </ReactFlowProvider>
    );
}

type MapNode = Node<GroupNodeData, "group">;

function MapPanelInner(): JSX.Element {
    const mapsQ = useQuery(mapsQuery());
    const gv = useGroups();
    const qc = useQueryClient();
    const { fitView } = useReactFlow();

    const maps = mapsQ.data ?? [];
    const [savedId, setSavedId] = usePersistedState<string | null>(SELECTED_KEY, (o) => (typeof o === "string" ? o : null), null);
    const activeMap = maps.find((m) => m.id === savedId) ?? maps[0] ?? null;

    const onMap = useMemo(() => (activeMap ? groupsOnMap(gv.groups, activeMap.id) : []), [gv.groups, activeMap]);
    const offMap = useMemo(() => (activeMap ? placeableGroups(gv.groups, activeMap.scope) : []), [gv.groups, activeMap]);
    const counts = useMemo(() => memberCounts(gv.memberships), [gv.memberships]);

    const [picked, setPicked] = useState<string | null>(null); // 짚은 그룹 — 목록·겹침 엣지의 기준
    const pickedGroup = picked === null ? null : (gv.groupById.get(picked) ?? null);

    // ── 노드 ──────────────────────────────────────────────────────────────
    const derived = useMemo<MapNode[]>(
        () =>
            onMap.map((g) => ({
                id: g.id,
                type: "group" as const,
                position: { x: g.x ?? 0, y: g.y ?? 0 },
                data: {
                    group: g,
                    count: counts.get(g.id) ?? 0,
                    depth: depthOf(onMap, g.id),
                    hasChildren: childrenOf(onMap, g.id).length > 0,
                },
            })),
        [onMap, counts],
    );

    const [nodes, setNodes] = useState<MapNode[]>([]);
    useEffect(() => {
        // 선택은 RF 가 노드에 들고 있으므로 갈아끼울 때 살려 둔다(재계산마다 선택이 풀리지 않게).
        setNodes((prev) => {
            const sel = new Map(prev.map((n) => [n.id, n.selected === true]));
            return derived.map((n) => ({ ...n, selected: sel.get(n.id) ?? false }));
        });
    }, [derived]);
    const onNodesChange = useCallback((cs: NodeChange<MapNode>[]) => setNodes((ns) => applyNodeChanges(cs, ns)), []);

    // ── 엣지 ──────────────────────────────────────────────────────────────
    // 중첩(부모→자식)은 상시, 겹침은 짚은 그룹의 것만. 둘을 색으로 가른다.
    const edges = useMemo<Edge[]>(() => {
        const ids = new Set(onMap.map((g) => g.id));
        const nesting: Edge[] = onMap
            .filter((g) => g.parentId !== null && ids.has(g.parentId))
            .map((g) => ({
                id: `n:${g.parentId}-${g.id}`,
                source: g.parentId!,
                target: g.id,
                style: { stroke: "var(--border-strong)", strokeWidth: 1 },
                animated: false,
            }));
        if (picked === null) return nesting;
        const bridges: Edge[] = overlaps(gv.memberships, { within: ids, only: picked }).map((o) => ({
            id: `o:${o.aId}-${o.bId}`,
            source: o.aId,
            target: o.bId,
            label: String(o.count),
            style: { stroke: ACTIVE, strokeWidth: Math.min(6, 1 + Math.sqrt(o.count)) },
            labelStyle: { fontSize: 10, fill: ACTIVE },
            labelBgStyle: { fill: "var(--bg-primary)" },
        }));
        return [...nesting, ...bridges];
    }, [onMap, gv.memberships, picked]);

    // ── 쓰기 ──────────────────────────────────────────────────────────────
    const invalidateGroups = useCallback(() => void qc.invalidateQueries({ queryKey: groupsQuery().queryKey }), [qc]);

    const moveMut = useMutation({
        mutationFn: (moves: { id: string; x: number; y: number }[]) => moveGroups(moves),
        onError: invalidateGroups, // 낙관 갱신이 거짓이 된 채 남지 않게
    });
    const placeMut = useMutation({
        mutationFn: (v: { id: string; mapId: string; x: number; y: number }) => placeGroup(v.id, v.mapId, v.x, v.y),
        onSuccess: invalidateGroups,
    });
    const unplaceMut = useMutation({ mutationFn: (id: string) => unplaceGroup(id), onSuccess: invalidateGroups });
    const parentMut = useMutation({
        mutationFn: (v: { id: string; parentId: string | null }) => setGroupParent(v.id, v.parentId),
        onSuccess: invalidateGroups,
        onError: (e: Error) => window.alert(e.message), // 다른 평면·순환은 서버가 막는다 — 이유를 보여준다
    });
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
            await placeGroup(g.id, activeMap.id, 0, 0); // 만들자마자 평면 가운데에 올린다
            invalidateGroups();
        },
    });

    /** 드래그가 끝난 노드들의 최종 좌표를 커밋 — 좌표는 클라가 저자라 **invalidate 하지 않는다**. */
    const commitMove = useCallback(
        (dragged: MapNode[]) => {
            const moves = dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
            if (moves.length === 0) return;
            qc.setQueryData<Group[]>(groupsQuery().queryKey, (cur) =>
                cur?.map((g) => {
                    const m = moves.find((v) => v.id === g.id);
                    return m ? { ...g, x: m.x, y: m.y } : g;
                }),
            );
            moveMut.mutate(moves);
        },
        [qc, moveMut],
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
                <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>그룹 {onMap.length}{offMap.length > 0 && ` · 안 올림 ${offMap.length}`}</span>
            </PanelHeader>

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                    <ReactFlow<MapNode>
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        nodeTypes={MAP_NODE_TYPES}
                        nodeOrigin={NODE_ORIGIN}
                        onlyRenderVisibleElements
                        nodesConnectable={false}
                        edgesFocusable={false}
                        minZoom={0.05}
                        maxZoom={4}
                        onNodeDragStop={(_e, _n, dragged) => commitMove(dragged)}
                        onNodeClick={(_e, n) => setPicked(n.id)}
                        onPaneClick={() => setPicked(null)}
                    >
                        <Background gap={40} size={1} />
                        <Controls showInteractive={false} />
                        <MiniMap pannable zoomable nodeStrokeWidth={2} style={{ width: 120, height: 80 }} />
                    </ReactFlow>

                    {onMap.length === 0 && (
                        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "var(--text-tertiary)" }}>
                            그룹을 만들어 올리거나, 오른쪽에서 올리세요
                        </div>
                    )}
                </div>

                <SidePanel
                    picked={pickedGroup}
                    memberships={gv.memberships}
                    onMap={onMap}
                    offMap={offMap}
                    countOf={(id) => counts.get(id) ?? 0}
                    onPlace={(id) => activeMap && placeMut.mutate({ id, mapId: activeMap.id, x: 0, y: 0 })}
                    onUnplace={(id) => { unplaceMut.mutate(id); setPicked(null); }}
                    onSetParent={(id, parentId) => parentMut.mutate({ id, parentId })}
                />
            </div>
        </div>
    );
}

/** 오른쪽 판 — 짚은 그룹의 멤버(어떤 종목이 들었나)와 중첩 편집, 그리고 안 올린 그룹 목록. */
function SidePanel({
    picked,
    memberships,
    onMap,
    offMap,
    countOf,
    onPlace,
    onUnplace,
    onSetParent,
}: {
    picked: Group | null;
    memberships: ReturnType<typeof useGroups>["memberships"];
    onMap: Group[];
    offMap: Group[];
    countOf: (id: string) => number;
    onPlace: (id: string) => void;
    onUnplace: (id: string) => void;
    onSetParent: (id: string, parentId: string | null) => void;
}): JSX.Element {
    const members = useMemo(() => (picked ? membersOf(memberships, picked.id) : []), [memberships, picked]);
    const { nameOf } = useStockNames(); // 사전 한 벌(전량) — 코드 모아 넘기던 시절의 인자는 사라졌다


    return (
        <div style={{ width: 210, flex: "none", borderLeft: "1px solid var(--border-default)", overflowY: "auto", fontSize: 11 }}>
            {picked === null ? (
                <div style={{ padding: 8, color: "var(--text-tertiary)" }}>그룹을 누르면 든 종목과 겹침이 보입니다</div>
            ) : (
                <div>
                    <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-default)" }}>
                        <div style={{ fontSize: 12 }}>{picked.name}</div>
                        <div style={{ color: "var(--text-tertiary)" }}>멤버 {members.length}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                            <select
                                value={picked.parentId ?? ""}
                                onChange={(e) => onSetParent(picked.id, e.target.value === "" ? null : e.target.value)}
                                style={{ fontSize: 11, maxWidth: 130 }}
                                title="이 그룹을 어느 그룹 안에 둘지"
                            >
                                <option value="">최상위</option>
                                {onMap.filter((g) => g.id !== picked.id).map((g) => (
                                    <option key={g.id} value={g.id}>{g.name} 안</option>
                                ))}
                            </select>
                            <button onClick={() => onUnplace(picked.id)} title="평면에서 내린다(그룹은 남는다)">내리기</button>
                        </div>
                    </div>
                    {members.slice(0, 200).map((m) => (
                        <div key={`${m.stockCode}|${m.date}|${m.time ?? ""}`} style={{ padding: "2px 8px", display: "flex", justifyContent: "space-between", gap: 6 }}>
                            <span>{nameOf(m.stockCode)}</span>
                            <span style={{ color: "var(--text-tertiary)" }}>{m.date.slice(2)}{m.time ? ` ${m.time.slice(0, 5)}` : ""}</span>
                        </div>
                    ))}
                    {members.length > 200 && <div style={{ padding: "2px 8px", color: "var(--text-tertiary)" }}>…외 {members.length - 200}건</div>}
                </div>
            )}

            {offMap.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-strong)", marginTop: 8 }}>
                    <div style={{ padding: "6px 8px 3px", color: "var(--text-tertiary)" }}>안 올린 그룹 {offMap.length}</div>
                    {offMap.map((g) => (
                        <div key={g.id} style={{ padding: "2px 8px", display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                            <span>{g.name}</span>
                            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <span style={{ color: "var(--text-tertiary)" }}>{countOf(g.id)}</span>
                                <button onClick={() => onPlace(g.id)} title="이 평면에 올린다">올리기</button>
                            </span>
                        </div>
                    ))}
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
                placeholder="새 그룹 (미정1…)"
                style={{ fontSize: 11, width: 110 }}
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
