import { describe, it, expect } from "vitest";
import { spreadLabelPositions, type LabelSpec } from "../edgeLabels.js";

const d = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (s: LabelSpec) => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 });

describe("spreadLabelPositions — 겹칠 때만 제 선 위에서 미끄러진다", () => {
    it("혼자면 중점 그대로 — 안 겹치면 아무것도 안 움직인다", () => {
        const s: LabelSpec = { id: "a", from: { x: 0, y: 0 }, to: { x: 200, y: 0 } };
        expect(spreadLabelPositions([s]).get("a")).toEqual({ x: 100, y: 0 });
    });

    it("멀리 떨어진 둘도 그대로", () => {
        const specs: LabelSpec[] = [
            { id: "a", from: { x: 0, y: 0 }, to: { x: 200, y: 0 } },
            { id: "b", from: { x: 0, y: 500 }, to: { x: 200, y: 500 } },
        ];
        const out = spreadLabelPositions(specs);
        expect(out.get("a")).toEqual(mid(specs[0]!));
        expect(out.get("b")).toEqual(mid(specs[1]!));
    });

    // 같은 자리에서 나가 방향이 조금만 다른 두 선 — 중점이 한 골목에 몰리는 실제 상황(컨테이너와 그 자식).
    it("중점이 겹치는 둘은 서로 떨어진다", () => {
        const specs: LabelSpec[] = [
            { id: "a", from: { x: 0, y: 0 }, to: { x: 400, y: 0 } },
            { id: "b", from: { x: 0, y: 0 }, to: { x: 400, y: 20 } },
        ];
        const before = d(mid(specs[0]!), mid(specs[1]!));
        const out = spreadLabelPositions(specs);
        const after = d(out.get("a")!, out.get("b")!);
        expect(before).toBeLessThan(30);
        expect(after).toBeGreaterThan(before);
        expect(after).toBeGreaterThanOrEqual(29); // MIN_DIST 근처까지 벌어진다
    });

    it("라벨은 **제 선 위**에 남는다 — 어느 선의 숫자인지가 안 흐려진다", () => {
        const specs: LabelSpec[] = [
            { id: "a", from: { x: 0, y: 0 }, to: { x: 400, y: 0 } },
            { id: "b", from: { x: 0, y: 0 }, to: { x: 400, y: 20 } },
        ];
        const out = spreadLabelPositions(specs);
        // a 는 수평선이므로 y 가 그대로여야 한다(선을 벗어나 옆으로 밀리지 않는다).
        expect(out.get("a")!.y).toBe(0);
    });

    it("끝까지 밀리지 않는다 — 노드에 붙으면 어느 쪽 숫자인지 헷갈린다", () => {
        const specs: LabelSpec[] = Array.from({ length: 5 }, (_, i) => ({
            id: String(i),
            from: { x: 0, y: 0 },
            to: { x: 400, y: i * 6 },
        }));
        const out = spreadLabelPositions(specs);
        for (const [, p] of out) {
            expect(p.x).toBeGreaterThan(400 * 0.15); // 중점 200 에서 30% 한계 = 최소 60 근처
            expect(p.x).toBeLessThan(400 * 0.85);
        }
    });

    it("길이 0인 선(완전히 겹친 노드)에서도 안 죽는다", () => {
        const out = spreadLabelPositions([
            { id: "a", from: { x: 10, y: 10 }, to: { x: 10, y: 10 } },
            { id: "b", from: { x: 10, y: 10 }, to: { x: 10, y: 10 } },
        ]);
        expect(out.get("a")).toEqual({ x: 10, y: 10 });
        expect(Number.isFinite(out.get("b")!.x)).toBe(true);
    });

    it("빈 입력은 빈 결과", () => {
        expect(spreadLabelPositions([]).size).toBe(0);
    });
});
