// 유사도 맵 — 축 없는 평면에 닮은 것끼리 손으로 모으는 작업면.
//
// 무한 평면·등방 확대·마퀴 선택·노드 드래그는 **React Flow** 가 진다. 직접 짰다가 줌이 아예 안 붙는
// 버그를 냈고(조건부 렌더 뒤의 ref 를 deps 가 안 변하는 effect 로 잡았다), 그 층은 본론이 아닌데 틀리기 쉽다.
// 노드가 React 컴포넌트라는 점도 골랐다 — 이 맵의 종착점은 라벨이 아니라 **차트 썸네일**이다.
//
// **자리를 결국 수천 개 놓는다**(미배치가 지금 4806). 그래서 두 겹으로 답한다:
//   · 확대 쪽 = `onlyRenderVisibleElements`(화면 밖은 안 그린다)
//   · 축소 쪽 = **뭉치기**(축소하면 전부가 "보이는" 요소라 위 옵션이 하나도 못 거른다)
// 뭉침 칸을 화면 픽셀로 잡아 표식 수의 상한이 코퍼스가 아니라 화면 넓이로 정해진다(mapView.lodOf).
//
// ⚠ **무리(group)는 React Flow 의 부모 노드로 만들지 않는다**(다음 슬라이스): RF 부모는 사각형이고 자식
// 좌표가 부모 상대라 "멤버 명단이 본체·위치가 소속을 구속하지 않는다"는 원칙과 어긋난다. 멤버십은 우리
// 데이터로 들고, 헐은 배경 레이어에 직접 그린다.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Background,
    Controls,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    applyNodeChanges,
    useReactFlow,
    useStore,
    type Node,
    type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mapCorpusQuery, candidateDaysQuery, stocksMetaQuery } from "../api/queries.js";
import { addPlacements, createMap, movePlacements, removePlacements, type MapItemRef, type MapScope } from "../api/map.js";
import { usePersistedState } from "../store/persist.js";
import { PIN } from "../styles/palette.js";
import { MAP_NODE_TYPES, type BinNodeData, type ItemNodeData } from "./map/MapNodes.js";
import { MapTray } from "./map/MapTray.js";
import { lodOf, movedPlacements, quantizeZoom, unplacedDays, type MapBin } from "./map/mapView.js";

const SELECTED_KEY = "wb.mapSelected";
/** 저장 좌표를 노드의 **중심**으로 삼는다(기본은 좌상단) — 뭉침 무게중심과 낱개 위치가 같은 뜻이 되게. */
const NODE_ORIGIN: [number, number] = [0.5, 0.5];

export function MapPanel(): JSX.Element {
    // useReactFlow(screenToFlowPosition·fitBounds)를 쓰려면 Provider 안이어야 한다.
    return (
        <ReactFlowProvider>
            <MapPanelInner />
        </ReactFlowProvider>
    );
}

type MapNode = Node<ItemNodeData, "item"> | Node<BinNodeData, "bin">;

/** 트레이에서 집어 든 것 — 이름을 함께 든다(트레이만 이름을 안다). */
interface Ghost {
    item: MapItemRef;
    name: string;
    cx: number;
    cy: number;
}

function MapPanelInner(): JSX.Element {
    const corpus = useQuery(mapCorpusQuery());
    const candidates = useQuery(candidateDaysQuery());
    const qc = useQueryClient();
    const { screenToFlowPosition, fitBounds, fitView } = useReactFlow();

    const maps = corpus.data?.maps ?? [];
    const [savedId, setSavedId] = usePersistedState<string | null>(SELECTED_KEY, (o) => (typeof o === "string" ? o : null), null);
    const activeMap = maps.find((m) => m.id === savedId) ?? maps[0] ?? null;

    const placements = useMemo(
        () => (activeMap ? (corpus.data?.placements ?? []).filter((p) => p.mapId === activeMap.id) : []),
        [corpus.data, activeMap],
    );
    const unplaced = useMemo(
        () => (activeMap?.scope === "day" ? unplacedDays(candidates.data ?? [], placements) : []),
        [activeMap, candidates.data, placements],
    );

    // 배율만 구독한다 — `useViewport()` 를 쓰면 **이동할 때마다** 패널 전체가 다시 그려진다.
    // 뭉침은 배율에만 의존하므로(격자가 맵 공간 고정) 이동은 아무것도 바꾸지 않는다.
    const qz = useStore((s) => quantizeZoom(s.transform[2]));
    const lod = useMemo(() => lodOf(placements, 2 ** qz), [placements, qz]);

    // 이름은 **낱개로 그리는 자리**만 — 뭉친 표식은 개수만 보이므로 이름이 필요 없다.
    // 트레이 쪽 이름은 트레이가 자기가 그리는 범위(월)로 직접 해결한다(수천 코드를 한 번에 조회하지 않으려고).
    const codes = useMemo(() => lod.items.map((p) => p.item.stockCode), [lod.items]);
    const names = useQuery(stocksMetaQuery(codes));
    const nameOf = useCallback((code: string) => names.data?.find((m) => m.stockCode === code)?.name ?? code, [names.data]);

    const derived = useMemo<MapNode[]>(
        () => [
            ...lod.bins.map<MapNode>((b) => ({
                id: `b:${b.key}`,
                type: "bin",
                position: { x: b.x, y: b.y },
                data: { bin: b },
                draggable: false, // 줌이 만든 우연이지 무리가 아니다 — 수백 개가 손짓 한 번에 딸려가면 안 된다
                deletable: false,
            })),
            ...lod.items.map<MapNode>((p) => ({
                id: `p:${p.id}`,
                type: "item",
                position: { x: p.x, y: p.y },
                data: { placement: p, name: nameOf(p.item.stockCode) },
            })),
        ],
        [lod, nameOf],
    );

    const [nodes, setNodes] = useState<MapNode[]>([]);
    useEffect(() => {
        // 선택은 RF 가 노드에 들고 있으므로 갈아끼울 때 살려 둔다(안 그러면 재계산마다 선택이 풀린다).
        setNodes((prev) => {
            const sel = new Map(prev.map((n) => [n.id, n.selected === true]));
            return derived.map((n) => ({ ...n, selected: sel.get(n.id) ?? false }));
        });
    }, [derived]);
    const onNodesChange = useCallback((cs: NodeChange<MapNode>[]) => setNodes((ns) => applyNodeChanges(cs, ns)), []);

    // ── 쓰기 ──────────────────────────────────────────────────────────────
    const moveMut = useMutation({
        mutationFn: (v: { mapId: string; moves: { id: string; x: number; y: number }[] }) => movePlacements(v.mapId, v.moves),
        onError: () => void qc.invalidateQueries({ queryKey: mapCorpusQuery().queryKey }), // 낙관 갱신이 거짓이 된 채 남지 않게
    });
    const addMut = useMutation({
        mutationFn: (v: { mapId: string; item: MapItemRef; x: number; y: number }) => addPlacements(v.mapId, [{ item: v.item, x: v.x, y: v.y }]),
        onSuccess: () => void qc.invalidateQueries({ queryKey: mapCorpusQuery().queryKey }),
    });
    const removeMut = useMutation({
        mutationFn: (v: { mapId: string; ids: string[] }) => removePlacements(v.mapId, v.ids),
        onSuccess: () => void qc.invalidateQueries({ queryKey: mapCorpusQuery().queryKey }),
    });
    const createMut = useMutation({
        mutationFn: (v: { name: string; scope: MapScope }) => createMap(v.name, v.scope),
        onSuccess: (m) => {
            setSavedId(m.id);
            void qc.invalidateQueries({ queryKey: mapCorpusQuery().queryKey });
        },
    });

    /** 드래그가 끝난 노드들의 최종 좌표를 커밋 — 좌표는 클라가 저자라 **invalidate 하지 않는다**(낙관 갱신만). */
    const commitMove = useCallback(
        (dragged: MapNode[]) => {
            if (!activeMap) return;
            const moves = dragged
                .filter((n) => n.type === "item")
                .map((n) => ({ id: (n.data as ItemNodeData).placement.id, x: n.position.x, y: n.position.y }));
            if (moves.length === 0) return;
            qc.setQueryData(mapCorpusQuery().queryKey, (c) => (c ? { ...c, placements: movedPlacements(c.placements, moves) } : c));
            moveMut.mutate({ mapId: activeMap.id, moves });
        },
        [activeMap, qc, moveMut],
    );

    // ── 트레이 → 평면 ─────────────────────────────────────────────────────
    // ⚠ 부수효과를 setState 업데이터에 넣지 않는다: StrictMode 가 업데이터를 두 번 호출해 요청이 두 번 나간다
    // (실제로 같은 좌표에 겹친 자리가 남았던 사고). 드래그는 ref 로 들고 상태는 그리기 전용.
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const ghostRef = useRef<Ghost | null>(null);
    const putGhost = useCallback((g: Ghost | null) => {
        ghostRef.current = g;
        setGhost(g);
    }, []);
    const flowRef = useRef<HTMLDivElement | null>(null);

    // 이름을 집을 때 같이 받아 둔다 — 트레이의 이름은 트레이가 알고 패널은 모른다.
    const onPickDown = (e: ReactPointerEvent<HTMLDivElement>, item: MapItemRef, name: string): void => {
        e.currentTarget.setPointerCapture(e.pointerId);
        putGhost({ item, name, cx: e.clientX, cy: e.clientY });
    };
    const onPickMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
        const g = ghostRef.current;
        if (g) putGhost({ ...g, cx: e.clientX, cy: e.clientY });
    };
    const onPickUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
        const g = ghostRef.current;
        putGhost(null);
        const rect = flowRef.current?.getBoundingClientRect();
        if (!g || !activeMap || !rect) return;
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) return;
        const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addMut.mutate({ mapId: activeMap.id, item: g.item, x: at.x, y: at.y });
    };

    // ── 뭉친 표식 열기 ────────────────────────────────────────────────────
    const [openBin, setOpenBin] = useState<MapBin | null>(null);
    const zoomToBin = useCallback(
        (b: MapBin) => {
            const xs = b.members.map((m) => m.x);
            const ys = b.members.map((m) => m.y);
            const pad = 40;
            fitBounds(
                { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 },
                { duration: 250 },
            );
            setOpenBin(null);
        },
        [fitBounds],
    );

    // ── 렌더 ──────────────────────────────────────────────────────────────
    if (corpus.isPending) return <Note>불러오는 중…</Note>;
    if (corpus.isError) return <Note>맵을 불러오지 못했습니다: {(corpus.error as Error).message}</Note>;
    if (maps.length === 0) return <CreateMap onCreate={(name, scope) => createMut.mutate({ name, scope })} busy={createMut.isPending} />;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", overflowX: "auto" }}>
                <select value={activeMap?.id ?? ""} onChange={(e) => setSavedId(e.target.value)} style={{ fontSize: 12 }}>
                    {maps.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} [{m.scope === "day" ? "하루" : "타점"}]</option>
                    ))}
                </select>
                <button onClick={() => fitView({ duration: 250 })} title="전부 화면에 담기">원위치</button>
                <span style={{ color: "var(--text-tertiary)" }}>
                    배치 {placements.length} · 미배치 {unplaced.length}
                    {lod.bins.length > 0 && ` · 뭉침 ${lod.bins.length}`}
                </span>
            </div>

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <MapTray unplaced={unplaced} onPickDown={onPickDown} onPickMove={onPickMove} onPickUp={onPickUp} />

                <div ref={flowRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                    <ReactFlow<MapNode>
                        nodes={nodes}
                        onNodesChange={onNodesChange}
                        nodeTypes={MAP_NODE_TYPES}
                        nodeOrigin={NODE_ORIGIN}
                        onlyRenderVisibleElements
                        nodesConnectable={false}
                        edgesFocusable={false}
                        minZoom={0.02}
                        maxZoom={8}
                        deleteKeyCode={["Delete", "Backspace"]}
                        onNodeDragStop={(_e, _n, dragged) => commitMove(dragged)}
                        onNodesDelete={(deleted) => {
                            if (!activeMap) return;
                            const ids = deleted.filter((n) => n.type === "item").map((n) => (n.data as ItemNodeData).placement.id);
                            if (ids.length > 0) removeMut.mutate({ mapId: activeMap.id, ids });
                        }}
                        onNodeClick={(_e, n) => setOpenBin(n.type === "bin" ? (n.data as BinNodeData).bin : null)}
                        onNodeDoubleClick={(_e, n) => { if (n.type === "bin") zoomToBin((n.data as BinNodeData).bin); }}
                        onPaneClick={() => setOpenBin(null)}
                        proOptions={{ hideAttribution: false }}
                    >
                        <Background gap={40} size={1} />
                        <Controls showInteractive={false} />
                        <MiniMap pannable zoomable nodeStrokeWidth={2} style={{ width: 120, height: 80 }} />
                    </ReactFlow>

                    {placements.length === 0 && (
                        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "var(--text-tertiary)" }}>
                            왼쪽에서 끌어다 놓으세요
                        </div>
                    )}

                    {openBin && (
                        <div style={{ position: "absolute", right: 8, top: 8, zIndex: 6, width: 200, maxHeight: "60%", overflowY: "auto", background: "var(--bg-primary)", border: "1px solid var(--border-strong)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                            <div style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>{openBin.members.length}건</span>
                                <button onClick={() => zoomToBin(openBin)} style={{ fontSize: 11 }}>확대</button>
                            </div>
                            {openBin.members.map((m) => (
                                <div key={m.id} style={{ padding: "3px 8px", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 6 }}>
                                    <span>{nameOf(m.item.stockCode)}</span>
                                    <span style={{ color: "var(--text-tertiary)" }}>{m.item.date.slice(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {ghost && (
                <div style={{ position: "fixed", left: ghost.cx + 8, top: ghost.cy + 8, pointerEvents: "none", background: PIN, color: "#fff", padding: "2px 6px", borderRadius: 3, fontSize: 11, zIndex: 50 }}>
                    {ghost.name} {ghost.item.date.slice(2)}
                </div>
            )}
        </div>
    );
}

function Note({ children }: { children: ReactNode }): JSX.Element {
    return <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}

/** 맵이 하나도 없을 때 — scope 는 만든 뒤 못 바꾸므로(점의 정체가 곧 맵의 정체) 여기서 정한다. */
function CreateMap({ onCreate, busy }: { onCreate: (name: string, scope: MapScope) => void; busy: boolean }): JSX.Element {
    const [name, setName] = useState("일봉");
    const [scope, setScope] = useState<MapScope>("day");
    return (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
            <div style={{ color: "var(--text-tertiary)" }}>맵이 없습니다. 한 장 만들고 시작하세요.</div>
            <div style={{ display: "flex", gap: 6 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="맵 이름" style={{ fontSize: 12, width: 120 }} />
                <select value={scope} onChange={(e) => setScope(e.target.value as MapScope)} style={{ fontSize: 12 }}>
                    <option value="day">하루 (종목·날짜)</option>
                    <option value="point">타점 (종목·날짜·시각)</option>
                </select>
                <button disabled={busy || name.trim() === ""} onClick={() => onCreate(name.trim(), scope)}>만들기</button>
            </div>
        </div>
    );
}
