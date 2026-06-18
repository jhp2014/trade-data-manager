import dagre from "dagre";
import type { Hypothesis, HypothesisRelation } from "@/domain/types";

/**
 * 가설 관계 그래프 레이아웃(결정적, dagre).
 * 방향성 관계(better_than/parent_of)만 랭킹에 써서 상하 레이어를 만든다(위 = 더 좋음/상위).
 * similar_to/conflicts_with 는 위치에 영향 주지 않고 간선으로만 그린다.
 */
const NODE_W = 190;
const NODE_H = 60;
const DIRECTED = new Set(["better_than", "parent_of"]);

export type GraphNode = { id: string; x: number; y: number };
export type GraphEdge = { id: string; source: string; target: string; relationType: string };

export const GRAPH_NODE_SIZE = { width: NODE_W, height: NODE_H };

export function buildGraphLayout(
    hypotheses: Pick<Hypothesis, "id">[],
    relations: Pick<HypothesisRelation, "id" | "fromHypothesisId" | "toHypothesisId" | "relationType">[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 72, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const h of hypotheses) g.setNode(h.id, { width: NODE_W, height: NODE_H });
    for (const r of relations) {
        if (DIRECTED.has(r.relationType) && r.fromHypothesisId !== r.toHypothesisId) {
            // from(더 좋음/상위)이 위로 가도록 from→to.
            g.setEdge(r.fromHypothesisId, r.toHypothesisId);
        }
    }

    dagre.layout(g);

    const nodes: GraphNode[] = hypotheses.map((h) => {
        const n = g.node(h.id);
        // dagre 는 중심좌표 → React Flow 의 좌상단 좌표로 변환.
        return { id: h.id, x: (n?.x ?? 0) - NODE_W / 2, y: (n?.y ?? 0) - NODE_H / 2 };
    });
    const edges: GraphEdge[] = relations.map((r) => ({
        id: r.id,
        source: r.fromHypothesisId,
        target: r.toHypothesisId,
        relationType: r.relationType,
    }));

    return { nodes, edges };
}
