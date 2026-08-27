import { describe, it, expect } from "vitest";
import { scatterLayer } from "../scatterLayer.js";
import { ACTIVE, THEME_PEER } from "../../../styles/palette.js";

const scales = { x: (o: number): number => o * 10, y: (o: number): number => o * 10 };

describe("scatterLayer — 점 4상태", () => {
    const points = [
        { code: "SUBJ", rate: 1, amount: 2 },
        { code: "IN", rate: 3, amount: 4 }, // 존 안 동료
        { code: "OUT", rate: 99, amount: 4 }, // 존 밖 동료(등락 이탈)
        { code: "ETC", rate: 5, amount: 5 },
    ];
    const layer = scatterLayer({
        points, subject: "SUBJ", peers: new Set(["IN", "OUT"]),
        zone: { rateN: 30, amountN: 40 }, scales,
    });
    const ops = layer.groups.flatMap((g) => g.ops);
    const circles = ops.filter((o) => o.op === "circle") as { cx: number; cy: number; r: number; fill?: string; stroke?: string }[];

    it("시선은 채움+링(맨 위), 동료는 존 안 채움/존 밖 속 빈 점, 나머지는 회색", () => {
        const subj = circles.filter((c) => c.cx === 20 && c.cy === 10);
        expect(subj).toHaveLength(2); // 채움 + 링
        expect(subj.some((c) => c.fill === ACTIVE)).toBe(true);
        const inPeer = circles.find((c) => c.cx === 40 && c.cy === 30)!;
        expect(inPeer.fill).toBe(THEME_PEER);
        const outPeer = circles.find((c) => c.cx === 40 && c.cy === 990)!;
        expect(outPeer.fill).toBeUndefined(); // 속 빈 점
        expect(outPeer.stroke).toBe(THEME_PEER);
        const etc = circles.find((c) => c.cx === 50 && c.cy === 50)!;
        expect(etc.fill).toBe("var(--neutral)");
    });

    it("시선(맨 위)이 마지막 그룹이다 — 그리는 순서가 곧 위아래", () => {
        const last = layer.groups[layer.groups.length - 1].ops;
        expect(last.every((o) => o.op === "circle" && (o.fill === ACTIVE || o.stroke === ACTIVE))).toBe(true);
    });
});
