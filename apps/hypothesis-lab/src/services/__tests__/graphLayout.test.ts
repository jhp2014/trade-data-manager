import { describe, expect, it } from "vitest";
import { buildGraphLayout } from "@/services/graphLayout";

const hyp = (id: string) => ({ id });
const rel = (id: string, from: string, type: string, to: string) => ({
    id,
    fromHypothesisId: from,
    toHypothesisId: to,
    relationType: type,
});

describe("buildGraphLayout", () => {
    it("가설마다 노드, 관계마다 간선을 만든다", () => {
        const { nodes, edges } = buildGraphLayout(
            [hyp("H1"), hyp("H2"), hyp("H3")],
            [rel("r1", "H2", "better_than", "H1"), rel("r2", "H1", "similar_to", "H3")],
        );
        expect(nodes.map((n) => n.id).sort()).toEqual(["H1", "H2", "H3"]);
        expect(edges).toHaveLength(2);
        expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    });

    it("better_than 은 from(더 좋음)을 위로 배치한다", () => {
        const { nodes } = buildGraphLayout(
            [hyp("H1"), hyp("H2")],
            [rel("r1", "H2", "better_than", "H1")],
        );
        const byId = new Map(nodes.map((n) => [n.id, n]));
        expect(byId.get("H2")!.y).toBeLessThan(byId.get("H1")!.y);
    });

    it("parent_of 는 부모(from)를 위로 배치한다", () => {
        const { nodes } = buildGraphLayout(
            [hyp("P"), hyp("C")],
            [rel("r1", "P", "parent_of", "C")],
        );
        const byId = new Map(nodes.map((n) => [n.id, n]));
        expect(byId.get("P")!.y).toBeLessThan(byId.get("C")!.y);
    });

    it("관계 없는(고립) 노드는 본 그래프 오른쪽에 한 열로 모은다", () => {
        const { nodes } = buildGraphLayout(
            [hyp("A"), hyp("B"), hyp("X"), hyp("Y")],
            [rel("r1", "A", "better_than", "B")],
        );
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const relatedMaxX = Math.max(byId.get("A")!.x, byId.get("B")!.x);
        // 고립 노드(X, Y)는 관계 노드보다 오른쪽.
        expect(byId.get("X")!.x).toBeGreaterThan(relatedMaxX);
        expect(byId.get("Y")!.x).toBeGreaterThan(relatedMaxX);
        // 같은 열(x 동일) + 세로로 다른 위치.
        expect(byId.get("X")!.x).toBe(byId.get("Y")!.x);
        expect(byId.get("X")!.y).not.toBe(byId.get("Y")!.y);
    });

    it("모두 고립이면 한 열로 좌상단에 쌓는다", () => {
        const { nodes } = buildGraphLayout([hyp("A"), hyp("B")], []);
        const byId = new Map(nodes.map((n) => [n.id, n]));
        expect(byId.get("A")!.x).toBe(byId.get("B")!.x);
        expect(byId.get("A")!.y).not.toBe(byId.get("B")!.y);
        expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    });

    it("비방향 관계(similar_to)는 간선으로만 — 노드 위치 랭킹에 영향 없음", () => {
        const { nodes, edges } = buildGraphLayout(
            [hyp("A"), hyp("B")],
            [rel("r1", "A", "similar_to", "B")],
        );
        // 같은 랭크(같은 y 부근)로 나란히 — 상하 강제가 없어야 함.
        const byId = new Map(nodes.map((n) => [n.id, n]));
        expect(byId.get("A")!.y).toBe(byId.get("B")!.y);
        expect(edges[0].relationType).toBe("similar_to");
    });
});
