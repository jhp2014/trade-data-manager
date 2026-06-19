"use client";

import { useEffect, useMemo } from "react";
import ReactFlow, {
    Background,
    Controls,
    MarkerType,
    useNodesState,
    type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { buildGraphLayout } from "@/services/graphLayout";
import type { HypothesisSnapshot } from "@/domain/types";
import { useSelection } from "@/stores/selection";
import { HypNode, type HypNodeData } from "./HypNode";
import styles from "./HypothesisGraph.module.css";

const nodeTypes = { hyp: HypNode };

function edgeStyle(relationType: string): {
    style: React.CSSProperties;
    markerEnd?: { type: MarkerType; color: string };
} {
    switch (relationType) {
        case "better_than":
            return { style: { stroke: "#5b6cff" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#5b6cff" } };
        case "parent_of":
            return {
                style: { stroke: "#c1559b", strokeDasharray: "6 3" },
                markerEnd: { type: MarkerType.ArrowClosed, color: "#c1559b" },
            };
        case "similar_to":
            return { style: { stroke: "#9aa0ad", strokeDasharray: "3 4" } };
        case "conflicts_with":
            return { style: { stroke: "#d9534f", strokeDasharray: "1 5" } };
        default:
            return { style: { stroke: "#9aa0ad" } };
    }
}

export function HypothesisGraph({
    snapshot,
    highlightHypothesisIds,
    caseSelected,
    onToggleCaseLink,
}: {
    snapshot: HypothesisSnapshot | null;
    highlightHypothesisIds: string[];
    caseSelected: boolean;
    onToggleCaseLink: (hypothesisId: string, link: boolean) => void;
}) {
    const selectedHypothesisId = useSelection((s) => s.selectedHypothesisId);
    const selectHypothesis = useSelection((s) => s.selectHypothesis);
    const openHypothesisModal = useSelection((s) => s.openHypothesisModal);
    const [nodes, setNodes, onNodesChange] = useNodesState<HypNodeData>([]);

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
                ? buildGraphLayout(snapshot.hypotheses, snapshot.hypothesisRelations)
                : { nodes: [], edges: [] },
        // 구조 키가 같으면 레이아웃을 재계산하지 않는다.
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
        };
    }

    // 구조 변화 → dagre 위치로 (재)배치.
    useEffect(() => {
        if (!snapshot) {
            setNodes([]);
            return;
        }
        const hById = new Map(snapshot.hypotheses.map((h) => [h.id, h]));
        setNodes(
            layout.nodes.map((n) => ({
                id: n.id,
                type: "hyp",
                position: { x: n.x, y: n.y },
                data: dataFor(n.id, hById.get(n.id)!),
            })),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout]);

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
    }, [selectedHypothesisId, highlight, tagsByHyp, snapshot, caseSelected, onToggleCaseLink]);

    const edges: Edge[] = useMemo(
        () =>
            layout.edges.map((e) => {
                const s = edgeStyle(e.relationType);
                const touches =
                    selectedHypothesisId != null &&
                    (e.source === selectedHypothesisId || e.target === selectedHypothesisId);
                return {
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    type: "default",
                    markerEnd: s.markerEnd,
                    style: {
                        ...s.style,
                        strokeWidth: touches ? 2.4 : 1.4,
                        opacity: selectedHypothesisId && !touches ? 0.35 : 1,
                    },
                };
            }),
        [layout, selectedHypothesisId],
    );

    if (!snapshot) return <div className={styles.placeholder}>불러오는 중…</div>;
    if (snapshot.hypotheses.length === 0) return <div className={styles.placeholder}>가설이 없습니다</div>;

    return (
        <div className={styles.wrap}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.18, maxZoom: 1.25 }}
                minZoom={0.2}
                nodesConnectable={false}
                onNodeClick={(_, n) => selectHypothesis(n.id)}
                onNodeDoubleClick={(_, n) => openHypothesisModal(n.id)}
                onPaneClick={() => selectHypothesis(null)}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={18} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
