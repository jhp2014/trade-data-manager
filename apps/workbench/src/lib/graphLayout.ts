import dagre from "dagre";
import { DIRECTIONAL } from "./relationTypes.js";
import type { HypothesisRelation } from "../api/hypotheses.js";

// 가설 관계 그래프 레이아웃(결정적, dagre) — 옛 hypothesis-lab graphLayout 이식.
// 방향성 관계만 랭킹에 써서 상하 레이어(위=from). 고립 노드(어떤 관계에도 없음)는 우측 한 열.
const NODE_W = 200;
const NODE_H = 54;
const MARGIN = 24;
const ISO_GAP = 120;
const ISO_VGAP = 20;

export interface GraphNodePos {
    id: string;
    x: number;
    y: number;
}

export function buildGraphLayout(
    hypIds: string[],
    relations: HypothesisRelation[],
    directional: Set<string> = DIRECTIONAL,
): GraphNodePos[] {
    const relatedIds = new Set<string>();
    for (const r of relations) {
        if (r.fromId !== r.toId) {
            relatedIds.add(r.fromId);
            relatedIds.add(r.toId);
        }
    }
    const related = hypIds.filter((id) => relatedIds.has(id));
    const isolated = hypIds.filter((id) => !relatedIds.has(id));

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 72, marginx: MARGIN, marginy: MARGIN });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of related) g.setNode(id, { width: NODE_W, height: NODE_H });
    for (const r of relations) {
        if (directional.has(r.relationType) && r.fromId !== r.toId) g.setEdge(r.fromId, r.toId);
    }
    dagre.layout(g);

    const pos = new Map<string, { x: number; y: number }>();
    let maxX = 0;
    let minY = Infinity;
    for (const id of related) {
        const n = g.node(id);
        const x = (n?.x ?? 0) - NODE_W / 2; // dagre 중심좌표 → React Flow 좌상단
        const y = (n?.y ?? 0) - NODE_H / 2;
        pos.set(id, { x, y });
        maxX = Math.max(maxX, x + NODE_W);
        minY = Math.min(minY, y);
    }
    if (!Number.isFinite(minY)) minY = MARGIN;

    const colX = related.length > 0 ? maxX + ISO_GAP : MARGIN;
    isolated.forEach((id, i) => pos.set(id, { x: colX, y: minY + i * (NODE_H + ISO_VGAP) }));

    return hypIds.map((id) => ({ id, ...(pos.get(id) ?? { x: 0, y: 0 }) }));
}
