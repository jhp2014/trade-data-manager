import dagre from "dagre";
import { DEFAULT_RELATION_TYPES, directionalValues } from "@/domain/relationType";
import type { Hypothesis, HypothesisRelation } from "@/domain/types";

/**
 * 가설 관계 그래프 레이아웃(결정적, dagre).
 * 방향성 관계만 랭킹에 써서 상하 레이어를 만든다(위 = from). 어떤 종류가 방향성인지는
 * relationTypes 스토어가 정하므로 directional 집합을 인자로 받는다(미지정 시 기본 시드).
 * 무방향 관계는 위치에 영향 주지 않고 간선으로만 그린다.
 */
const NODE_W = 190;
const NODE_H = 60;
const DEFAULT_DIRECTED = directionalValues(DEFAULT_RELATION_TYPES);
const MARGIN = 24;
// 관계 없는(고립) 노드를 본 그래프 오른쪽에 한 열로 모을 때의 간격.
const ISOLATED_GAP = 120;
const ISOLATED_VGAP = 24;

export type GraphNode = { id: string; x: number; y: number };
export type GraphEdge = { id: string; source: string; target: string; relationType: string };

export const GRAPH_NODE_SIZE = { width: NODE_W, height: NODE_H };

export function buildGraphLayout(
    hypotheses: Pick<Hypothesis, "id">[],
    relations: Pick<HypothesisRelation, "id" | "fromHypothesisId" | "toHypothesisId" | "relationType">[],
    directional: Set<string> = DEFAULT_DIRECTED,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
    // 어떤 관계에도 등장하지 않는 노드는 "고립"으로 보고 본 그래프에서 빼,
    // dagre 가 빈 랭크에 흩뿌리지 않도록 한다(아래에서 따로 한 열로 모음).
    const relatedIds = new Set<string>();
    for (const r of relations) {
        if (r.fromHypothesisId !== r.toHypothesisId) {
            relatedIds.add(r.fromHypothesisId);
            relatedIds.add(r.toHypothesisId);
        }
    }
    const related = hypotheses.filter((h) => relatedIds.has(h.id));
    const isolated = hypotheses.filter((h) => !relatedIds.has(h.id));

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 72, marginx: MARGIN, marginy: MARGIN });
    g.setDefaultEdgeLabel(() => ({}));

    for (const h of related) g.setNode(h.id, { width: NODE_W, height: NODE_H });
    for (const r of relations) {
        if (directional.has(r.relationType) && r.fromHypothesisId !== r.toHypothesisId) {
            // from 이 위로 가도록 from→to.
            g.setEdge(r.fromHypothesisId, r.toHypothesisId);
        }
    }

    dagre.layout(g);

    const pos = new Map<string, { x: number; y: number }>();
    let maxX = 0;
    let minY = Infinity;
    for (const h of related) {
        const n = g.node(h.id);
        // dagre 는 중심좌표 → React Flow 의 좌상단 좌표로 변환.
        const x = (n?.x ?? 0) - NODE_W / 2;
        const y = (n?.y ?? 0) - NODE_H / 2;
        pos.set(h.id, { x, y });
        maxX = Math.max(maxX, x + NODE_W);
        minY = Math.min(minY, y);
    }
    if (!Number.isFinite(minY)) minY = MARGIN;

    // 고립 노드는 본 그래프 오른쪽(없으면 좌상단)에 세로 한 열로 모은다.
    const colX = related.length > 0 ? maxX + ISOLATED_GAP : MARGIN;
    isolated.forEach((h, i) => {
        pos.set(h.id, { x: colX, y: minY + i * (NODE_H + ISOLATED_VGAP) });
    });

    const nodes: GraphNode[] = hypotheses.map((h) => ({ id: h.id, ...pos.get(h.id)! }));
    const edges: GraphEdge[] = relations.map((r) => ({
        id: r.id,
        source: r.fromHypothesisId,
        target: r.toHypothesisId,
        relationType: r.relationType,
    }));

    return { nodes, edges };
}
