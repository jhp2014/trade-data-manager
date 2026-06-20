"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
    Background,
    Controls,
    MarkerType,
    SelectionMode,
    useNodesState,
    type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { buildGraphLayout } from "@/services/graphLayout";
import {
    clearGraphPositions,
    loadGraphPositions,
    saveGraphPositions,
    type NodePositions,
} from "@/lib/graphPositions";
import {
    directionalValues,
    findRelationType,
    toEdgeVisual,
    type EdgeVisual,
    type RelationEdgeType,
} from "@/domain/relationType";
import type { HypothesisSnapshot } from "@/domain/types";
import { useRelationTypes } from "@/stores/relationTypes";
import { useSelection } from "@/stores/selection";
import { useWorkbench } from "@/stores/workbench";
import { HypNode, type HypNodeData } from "./HypNode";
import { SavedLayoutModal } from "./SavedLayoutModal";
import styles from "./HypothesisGraph.module.css";

const nodeTypes = { hyp: HypNode };

/** RelationEdgeType → React Flow 빌트인 edge type. */
function rfEdgeType(t: RelationEdgeType): string {
    return t === "bezier" ? "default" : t;
}

/** EdgeVisual → React Flow edge 의 style/marker. */
function edgeFromVisual(v: EdgeVisual): {
    type: string;
    style: React.CSSProperties;
    markerStart?: { type: MarkerType; color: string };
    markerEnd?: { type: MarkerType; color: string };
} {
    const marker = {
        type: v.arrowHead === "open" ? MarkerType.Arrow : MarkerType.ArrowClosed,
        color: v.stroke,
    };
    return {
        type: rfEdgeType(v.edgeType),
        style: {
            stroke: v.stroke,
            strokeDasharray: v.dash,
            strokeLinecap: v.round ? "round" : undefined,
        },
        markerStart: v.arrowSide === "start" ? marker : undefined,
        markerEnd: v.arrowSide === "end" ? marker : undefined,
    };
}

export function HypothesisGraph({
    snapshot,
    highlightHypothesisIds,
    filterHypothesisIds,
    caseSelected,
    onToggleCaseLink,
}: {
    snapshot: HypothesisSnapshot | null;
    highlightHypothesisIds: string[];
    filterHypothesisIds: string[];
    caseSelected: boolean;
    onToggleCaseLink: (hypothesisId: string, link: boolean) => void;
}) {
    const relationTypes = useRelationTypes((s) => s.options);
    const directional = useMemo(() => directionalValues(relationTypes), [relationTypes]);
    const selectedHypothesisId = useSelection((s) => s.selectedHypothesisId);
    const selectHypothesis = useSelection((s) => s.selectHypothesis);
    const openHypothesisModal = useSelection((s) => s.openHypothesisModal);
    const appendOrCycleRef = useWorkbench((s) => s.appendOrCycleRef);
    const removeRef = useWorkbench((s) => s.removeRef);
    const [nodes, setNodes, onNodesChange] = useNodesState<HypNodeData>([]);
    // 저장 버튼 클릭 직후 잠깐 체크 표시.
    const [justSaved, setJustSaved] = useState(false);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 이름 저장/불러오기 모달.
    const [layoutModal, setLayoutModal] = useState<"save" | "load" | null>(null);

    // 가설/관계 "집합"이 바뀔 때만 dagre 재배치(드래그 보존을 위해 위치 리셋을 최소화).
    const structureKey = useMemo(
        () =>
            snapshot
                ? snapshot.hypotheses.map((h) => h.id).join(",") +
                  "|" +
                  snapshot.hypothesisRelations.map((r) => r.id).join(",")
                : "",
        [snapshot],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const layout = useMemo(
        () =>
            snapshot
                ? buildGraphLayout(snapshot.hypotheses, snapshot.hypothesisRelations, directional)
                : { nodes: [], edges: [] },
        // 구조 키가 같으면 레이아웃을 재계산하지 않는다(방향성 변경은 간선 렌더에만 즉시 반영).
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [structureKey],
    );

    const tagsByHyp = useMemo(() => {
        const m = new Map<string, string[]>();
        if (!snapshot) return m;
        const nameOf = new Map(snapshot.tags.map((t) => [t.id, t.name]));
        for (const ht of snapshot.hypothesisTags) {
            const arr = m.get(ht.hypothesisId) ?? [];
            arr.push(nameOf.get(ht.tagId) ?? "");
            m.set(ht.hypothesisId, arr);
        }
        return m;
    }, [snapshot]);

    const caseCountByHyp = useMemo(() => {
        const m = new Map<string, number>();
        if (!snapshot) return m;
        for (const hc of snapshot.hypothesisCases) {
            m.set(hc.hypothesisId, (m.get(hc.hypothesisId) ?? 0) + 1);
        }
        return m;
    }, [snapshot]);

    const highlight = useMemo(() => new Set(highlightHypothesisIds), [highlightHypothesisIds]);
    const inFilter = useMemo(() => new Set(filterHypothesisIds), [filterHypothesisIds]);

    function dataFor(id: string, h: { code: string; text: string }): HypNodeData {
        const linkedToCase = highlight.has(id);
        return {
            code: h.code,
            text: h.text,
            tags: tagsByHyp.get(id) ?? [],
            linkedCaseCount: caseCountByHyp.get(id) ?? 0,
            linkedToCase,
            caseSelected,
            onToggleLink: () => onToggleCaseLink(id, !linkedToCase),
            selected: id === selectedHypothesisId,
            highlight: highlight.has(id),
            inFilter: inFilter.has(id),
        };
    }

    // 구조 변화 → dagre 위치로 (재)배치. 저장된 위치가 있으면 그걸 우선 복원.
    useEffect(() => {
        if (!snapshot) {
            setNodes([]);
            return;
        }
        const hById = new Map(snapshot.hypotheses.map((h) => [h.id, h]));
        const saved = loadGraphPositions();
        setNodes(
            layout.nodes.map((n) => ({
                id: n.id,
                type: "hyp",
                position: saved[n.id] ?? { x: n.x, y: n.y },
                data: dataFor(n.id, hById.get(n.id)!),
            })),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout]);

    // 현재 노드 위치를 저장. 다음 로드부터 dagre 기본값 대신 이 위치를 복원한다.
    const handleSavePositions = useCallback(() => {
        const pos: NodePositions = {};
        for (const n of nodes) pos[n.id] = { x: n.position.x, y: n.position.y };
        saveGraphPositions(pos);
        setJustSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setJustSaved(false), 1400);
    }, [nodes]);

    // 저장 위치를 버리고 dagre 기본 배치로 되돌린다.
    const handleResetPositions = useCallback(() => {
        clearGraphPositions();
        const posById = new Map(layout.nodes.map((n) => [n.id, n]));
        setNodes((prev) =>
            prev.map((n) => {
                const l = posById.get(n.id);
                return l ? { ...n, position: { x: l.x, y: l.y } } : n;
            }),
        );
    }, [layout, setNodes]);

    // 현재 노드 위치를 { id: {x,y} } 로 (모달 저장용).
    const currentPositions = useMemo(() => {
        const pos: NodePositions = {};
        for (const n of nodes) pos[n.id] = { x: n.position.x, y: n.position.y };
        return pos;
    }, [nodes]);

    // 이름 저장본 불러오기: 저장된 위치를 적용하고, 작업 중 위치(자동 복원 슬롯)에도
    // 반영해 리셋 후에도 유지되게 한다. 저장본에 없는 노드는 현재 위치를 보존.
    const handleApplyLayout = useCallback(
        (positions: NodePositions) => {
            const next: NodePositions = {};
            const applied = nodes.map((n) => {
                const p = positions[n.id] ?? n.position;
                next[n.id] = { x: p.x, y: p.y };
                return { ...n, position: { x: p.x, y: p.y } };
            });
            setNodes(applied);
            saveGraphPositions(next);
        },
        [nodes, setNodes],
    );

    useEffect(() => () => {
        if (savedTimer.current) clearTimeout(savedTimer.current);
    }, []);

    // 선택/강조/내용 변화 → 위치는 유지하고 data 만 갱신(드래그한 위치 보존).
    useEffect(() => {
        if (!snapshot) return;
        const hById = new Map(snapshot.hypotheses.map((h) => [h.id, h]));
        setNodes((prev) =>
            prev.map((n) => {
                const h = hById.get(n.id);
                return h ? { ...n, data: dataFor(n.id, h) } : n;
            }),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedHypothesisId, highlight, inFilter, tagsByHyp, snapshot, caseSelected, onToggleCaseLink]);

    const edges: Edge[] = useMemo(
        () =>
            layout.edges.map((e) => {
                const v = edgeFromVisual(toEdgeVisual(findRelationType(relationTypes, e.relationType)));
                const touches =
                    selectedHypothesisId != null &&
                    (e.source === selectedHypothesisId || e.target === selectedHypothesisId);
                return {
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    type: v.type,
                    markerStart: v.markerStart,
                    markerEnd: v.markerEnd,
                    style: {
                        ...v.style,
                        strokeWidth: touches ? 2.4 : 1.4,
                        opacity: selectedHypothesisId && !touches ? 0.35 : 1,
                    },
                };
            }),
        [layout, selectedHypothesisId, relationTypes],
    );

    if (!snapshot) return <div className={styles.placeholder}>불러오는 중…</div>;
    if (snapshot.hypotheses.length === 0) return <div className={styles.placeholder}>가설이 없습니다</div>;

    return (
        <div className={styles.wrap}>
            <div className={styles.toolbar}>
                <button
                    type="button"
                    className={`${styles.toolBtn} ${justSaved ? styles.toolBtnOk : ""}`}
                    onClick={handleSavePositions}
                    title="현재 그래프 위치 저장"
                    aria-label="현재 그래프 위치 저장"
                >
                    {justSaved ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M20 6 9 17l-5-5" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <path d="M17 21v-8H7v8M7 3v5h8" />
                        </svg>
                    )}
                </button>
                <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => setLayoutModal("save")}
                    title="이름으로 레이아웃 저장"
                    aria-label="이름으로 레이아웃 저장"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                </button>
                <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => setLayoutModal("load")}
                    title="저장된 레이아웃 불러오기"
                    aria-label="저장된 레이아웃 불러오기"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                </button>
                <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={handleResetPositions}
                    title="노드를 기본 위치로 리셋"
                    aria-label="노드를 기본 위치로 리셋"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                </button>
            </div>
            <SavedLayoutModal
                kind={layoutModal}
                currentPositions={currentPositions}
                onApply={handleApplyLayout}
                onClose={() => setLayoutModal(null)}
            />
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.18, maxZoom: 1.25 }}
                minZoom={0.2}
                nodesConnectable={false}
                // 빈 영역 좌-드래그 = 박스 다중선택(걸친 노드도 포함), 선택 후 하나를
                // 잡고 옮기면 함께 이동. 화면 이동은 휠(1)/우(2) 버튼 드래그로.
                selectionOnDrag
                selectionMode={SelectionMode.Partial}
                panOnDrag={[1, 2]}
                onNodeClick={(_, n) => selectHypothesis(n.id)}
                onNodeDoubleClick={(_, n) => openHypothesisModal(n.id)}
                onNodeContextMenu={(e, n) => {
                    e.preventDefault();
                    const code = (n.data as HypNodeData).code;
                    if (e.shiftKey) removeRef(code);
                    else appendOrCycleRef(code);
                }}
                onPaneClick={() => selectHypothesis(null)}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={18} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
