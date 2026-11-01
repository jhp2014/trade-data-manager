import { describe, expect, it } from "vitest";
import { CHIP_ROW_H, CHIP_W, edgeTarget, layoutLineMarks, type LineMark } from "./lineMarks.js";

const mark = (key: string, time: string): LineMark => ({ key, time, price: 100, short: key, info: { head: key, hint: "" }, kind: "temp" });

describe("layoutLineMarks", () => {
    it("상자 안은 칩, 밖은 ◀▶ 묶음, 시리즈에 없는 봉은 버린다", () => {
        const xs: Record<string, number | null> = { a: -5, b: 50, c: 900, d: null };
        const l = layoutLineMarks([mark("a", "1"), mark("b", "2"), mark("c", "3"), mark("d", "4")], (m) => xs[m.key], () => 10, 400);
        expect(l.inView.map((p) => p.mark.key)).toEqual(["b"]);
        expect(l.offLeft.map((m) => m.key)).toEqual(["a"]);
        expect(l.offRight.map((m) => m.key)).toEqual(["c"]);
    });
    it("칩 폭보다 가까운 칩은 아랫줄로 비켜 선다 — 같은 봉의 H·L 도 둘 다 보인다", () => {
        const xs: Record<string, number> = { h: 100, l: 100, far: 100 + CHIP_W + 2 };
        const l = layoutLineMarks([mark("h", "1"), mark("l", "1"), mark("far", "2")], (m) => xs[m.key], () => null, 400);
        const y = Object.fromEntries(l.inView.map((p) => [p.mark.key, p.chipY]));
        expect(y.l - y.h).toBe(CHIP_ROW_H);
        expect(y.far).toBe(y.h); // 멀면 첫 줄
    });
});

describe("edgeTarget", () => {
    it("◀ = 왼쪽 밖에서 가장 늦은 날, ▶ = 오른쪽 밖에서 가장 이른 날", () => {
        const items = [mark("a", "2026-06-01"), mark("b", "2026-06-20"), mark("c", "2026-06-10")];
        expect(edgeTarget("left", items)).toBe("2026-06-20");
        expect(edgeTarget("right", items)).toBe("2026-06-01");
    });
});

describe("edgeTarget — 분봉(unix 초)", () => {
    it("숫자 시각도 같은 규칙", () => {
        const at = (key: string, time: number): LineMark => ({ key, time, price: 1, short: key, info: { head: key, hint: "" }, kind: "saved" });
        expect(edgeTarget("left", [at("a", 100), at("b", 300)])).toBe(300);
        expect(edgeTarget("right", [at("a", 100), at("b", 300)])).toBe(100);
    });
});
