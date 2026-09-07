import { describe, it, expect } from "vitest";
import { scatterLayer } from "../scatterLayer.js";
import { themeColorMap } from "../themeColor.js";
import { ACTIVE } from "../../../styles/palette.js";

const scales = { x: (o: number): number => o * 10, y: (o: number): number => o * 10 };
const colorOf = themeColorMap(["A", "B"]);
const A = colorOf.get("A")!;
const B = colorOf.get("B")!;

describe("scatterLayer — 시선·동료·겹침 3상태", () => {
    const points = [
        { code: "SUBJ", rate: 1, amount: 2 },
        { code: "PEER_A", rate: 3, amount: 4 },
        { code: "BOTH", rate: 5, amount: 6 }, // A·B 둘 다
        { code: "ETC", rate: 7, amount: 8 }, // 동료 아님 — 안 그려진다
    ];
    const peerThemes = new Map<string, string[]>([["PEER_A", ["A"]], ["BOTH", ["A", "B"]]]);
    const layer = scatterLayer({ points, subject: "SUBJ", peerThemes, colorOf, lens: null, scales });
    const circles = layer.groups.flatMap((g) => g.ops).filter((o) => o.op === "circle") as { cx: number; cy: number; r: number; fill?: string; stroke?: string }[];

    it("동료가 아닌 종목은 아예 안 그린다(회색 층 폐지)", () => {
        expect(circles.some((c) => c.cx === 80 && c.cy === 70)).toBe(false);
    });

    it("동료는 첫 테마색 채움, 존 안/밖은 표시하지 않는다", () => {
        const peer = circles.filter((c) => c.cx === 40 && c.cy === 30);
        expect(peer).toHaveLength(1); // 링 없음 — 링은 겹침 전용이다
        expect(peer[0].fill).toBe(A);
    });

    it("겹친 동료는 채움(첫 테마) + 둘째 테마색 링", () => {
        const both = circles.filter((c) => c.cx === 60 && c.cy === 50);
        expect(both).toHaveLength(2);
        expect(both.find((c) => c.fill)!.fill).toBe(A);
        expect(both.find((c) => c.stroke)!.stroke).toBe(B);
    });

    it("시선(맨 위)이 마지막 그룹이다 — 그리는 순서가 곧 위아래", () => {
        const last = layer.groups[layer.groups.length - 1].ops;
        expect(last.every((o) => o.op === "circle" && (o.fill === ACTIVE || o.stroke === ACTIVE))).toBe(true);
    });

    it("렌즈는 색이 아니라 강도를 바꾼다 — 렌즈 밖 동료는 옅은 그룹으로 간다", () => {
        const lensed = scatterLayer({ points, subject: "SUBJ", peerThemes, colorOf, lens: "B", scales });
        const dim = lensed.groups.find((g) => (g.opacity ?? 1) < 0.9)!;
        const dimCircles = dim.ops.filter((o) => o.op === "circle") as readonly { cx: number; fill?: string }[];
        expect(dimCircles).toHaveLength(1);
        expect(dimCircles[0].cx).toBe(40); // PEER_A — B 를 공유하지 않는다
        expect(dimCircles[0].fill).toBe(A); // 회색으로 죽지 않는다
        // BOTH 는 B 를 공유하므로 진한 그룹에 남는다(채움 + 링 2개).
        const strong = lensed.groups.find((g) => g.opacity === 0.95)!;
        expect(strong.ops).toHaveLength(2);
    });
});

describe("themeColorMap — 이름 해시 + 시선 안 충돌 회피", () => {
    it("같은 이름은 언제나 같은 색(다른 시선에서도)", () => {
        expect(themeColorMap(["로봇", "2차전지"]).get("로봇")).toBe(themeColorMap(["로봇"]).get("로봇"));
    });

    it("한 목록 안에서는 색이 겹치지 않는다 — 해시가 부딪혀도 다음 자리로 민다", () => {
        // charCode 가 10 간격인 이름들 = 해시가 같은 버킷으로 떨어진다(충돌 회피 경로를 실제로 밟는다).
        const themes = ["A", "K", "U", "_"]; // A · K · U · _
        const map = themeColorMap(themes);
        expect(new Set(map.values()).size).toBe(themes.length);
        // 첫 배정은 해시 그대로여야 한다(밀린 건 뒤에 온 것들뿐 — "이 테마 = 이 색"의 안정성).
        expect(map.get("A")).toBe(themeColorMap(["A"]).get("A"));
    });

    it("색 수(10)를 넘는 목록도 끝난다 — 11번째부터는 돌려쓴다", () => {
        const themes = Array.from({ length: 14 }, (_, i) => `t${i}`);
        const map = themeColorMap(themes);
        expect(map.size).toBe(14); // 무한루프·누락 없이 전부 배정
        expect(new Set(map.values()).size).toBe(10); // 팔레트 크기까지만 서로 다르다
    });

    it("같은 이름이 두 번 오면 첫 배정을 지킨다", () => {
        const map = themeColorMap(["A", "A", "B"]);
        expect(map.size).toBe(2);
        expect(map.get("A")).toBe(themeColorMap(["A"]).get("A"));
    });
});
