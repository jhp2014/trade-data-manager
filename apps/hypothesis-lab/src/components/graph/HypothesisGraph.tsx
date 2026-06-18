"use client";

import { useMemo } from "react";
import ReactFlow, {
    Background,
    Controls,
    MarkerType,
    type Edge,
    type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { buildGraphLayout } from "@/services/graphLayout";
import type { HypothesisSnapshot } from "@/domain/types";
import { useSelection } from "@/stores/selection";
import { HypNode, type HypNodeData } from "./HypNode";

const nodeTypes = { hyp: HypNode };

const TAG_PALETTE = ["#5b6cff", "#2fb37a", "#e0883a", "#c1559b", "#3aa6c1", "#d9534f", "#8a7dff"];

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
}: {
    snapshot: HypothesisSnapshot | null;
    highlightHypothesisIds: string[];
}) {
    const selectedHypothesisId = useSelection((s) => s.selectedHypothesisId);
    const selectHypothesis = useSelection((s) => s.selectHypothesis);

    const layout = useMemo(
        () =>
            snapshot
                ? buildGraphLayout(snapshot.hypotheses, snapshot.hypothesisRelations)
                : { nodes: [], edges: [] },
        [snapshot],
    );

    const tagsByHyp = useMemo(() => {
        const m = new Map<string, { name: string; color: string }[]>();
        if (!snapshot) return m;
        const colorOf = new Map(snapshot.tags.map((t, i) => [t.id, TAG_PALETTE[i % TAG_PALETTE.length]]));
        const nameOf = new Map(snapshot.tags.map((t) => [t.id, t.name]));
        for (const ht of snapshot.hypothesisTags) {
            const arr = m.get(ht.hypothesisId) ?? [];
            arr.push({ name: nameOf.get(ht.tagId) ?? "", color: colorOf.get(ht.tagId) ?? "#999" });
            m.set(ht.hypothesisId, arr);
        }
        return m;
    }, [snapshot]);

    const highlight = useMemo(() => new Set(highlightHypothesisIds), [highlightHypothesisIds]);

    const nodes: Node<HypNodeData>[] = useMemo(() => {
        if (!snapshot) return [];
        const hById = new Map(snapshot.hypotheses.map((h) => [h.id, h]));
        return layout.nodes.map((n) => {
            const h = hById.get(n.id)!;
            return {
                id: n.id,
                type: "hyp",
                position: { x: n.x, y: n.y },
                data: {
                    code: h.code,
                    text: h.text,
                    status: h.status,
                    tags: tagsByHyp.get(n.id) ?? [],
                    selected: n.id === selectedHypothesisId,
                    highlight: highlight.has(n.id),
                },
            };
        });
    }, [snapshot, layout, tagsByHyp, selectedHypothesisId, highlight]);

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

    if (!snapshot) return <div className="wb-placeholder">불러오는 중…</div>;
    if (snapshot.hypotheses.length === 0) return <div className="wb-placeholder">가설이 없습니다</div>;

    return (
        <div className="graph-wrap">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.2}
                nodesDraggable={false}
                nodesConnectable={false}
                onNodeClick={(_, n) => selectHypothesis(n.id)}
                onPaneClick={() => selectHypothesis(null)}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={18} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
