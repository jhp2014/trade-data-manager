import { describe, it, expect } from "vitest";
import { pickReadouts, layoutReadoutRows, type ReadoutCandidate } from "../readout.js";

const c = (code: string, pct: number, cumAmount: number, own = false): ReadoutCandidate =>
    ({ code, name: `${code}사`, y: pct, pct, amount: 0, cumAmount, ...(own ? { own: true } : {}) });

describe("pickReadouts — 등락률 상위 ∪ 누적 거래대금 상위", () => {
    // 등락률 순: E>D>C>B>A / 누적 대금 순: A>B>C>D>E (정확히 반대)
    const items = [c("A", 1, 500), c("B", 2, 400), c("C", 3, 300), c("D", 4, 200), c("E", 5, 100)];

    it("두 축을 각각 뽑아 합친다 — 겹치면 한 번만(10개가 안 나와도 된다)", () => {
        expect(pickReadouts(items, 2, 2).map((r) => r.code)).toEqual(["E", "D", "B", "A"]);
    });

    it("결과는 **값 내림차순** — 그림에서 위에 있는 선이 목록에서도 위", () => {
        expect(pickReadouts(items, 5, 5).map((r) => r.code)).toEqual(["E", "D", "C", "B", "A"]);
    });

    it("주인공(own)은 순위와 무관하게 언제나 남는다", () => {
        const withOwn = [...items, c("ME", -99, 1, true)];
        expect(pickReadouts(withOwn, 1, 1).map((r) => r.code)).toEqual(["E", "A", "ME"]);
    });

    it("후보가 상한보다 적으면 전부", () => {
        expect(pickReadouts([c("A", 1, 1)], 5, 5)).toHaveLength(1);
        expect(pickReadouts([], 5, 5)).toEqual([]);
    });
});

describe("layoutReadoutRows — 당기고 · 벌리고 · 밀어 넣기", () => {
    const range = { min: 100, max: 200 };
    const rows = (...ys: number[]) => ys.map((y, i) => ({ item: `i${i}`, y }));

    it("멀리 떨어져 있으면 제자리 그대로", () => {
        const out = layoutReadoutRows(rows(110, 150, 190), range, 12);
        expect(out.map((o) => o.labelY)).toEqual([110, 150, 190]);
        expect(out.every((o) => o.off === null)).toBe(true);
    });

    it("**상자 밖 값은 가장자리로 당기고 off 로 남긴다** — 확대해서 벗어난 선이 조용히 사라지지 않게", () => {
        const out = layoutReadoutRows(rows(40, 150, 320), range, 12);
        expect(out.map((o) => o.off)).toEqual(["up", null, "down"]);
        expect(out[0].anchorY).toBe(100);
        expect(out[2].anchorY).toBe(200);
    });

    it("겹치면 벌린다 — 지시선이 대응을 지므로 제 높이를 고집하지 않는다", () => {
        const out = layoutReadoutRows(rows(150, 152, 154), range, 12);
        const ys = out.map((o) => o.labelY).sort((a, b) => a - b);
        expect(ys[1] - ys[0]).toBeCloseTo(12);
        expect(ys[2] - ys[1]).toBeCloseTo(12);
        // 지시선이 가리키는 자리는 진짜 값 그대로다(벌어진 건 칩뿐).
        expect(out.map((o) => o.anchorY).sort((a, b) => a - b)).toEqual([150, 152, 154]);
    });

    it("벌린 무리가 상자를 넘치면 **통째로 민다** — 개별 클램프는 간격을 도로 깨뜨린다", () => {
        const out = layoutReadoutRows(rows(195, 197, 199), range, 12);
        expect(Math.max(...out.map((o) => o.labelY))).toBeLessThanOrEqual(200);
        const ys = out.map((o) => o.labelY).sort((a, b) => a - b);
        expect(ys[1] - ys[0]).toBeCloseTo(12); // 간격은 보존
        expect(ys[2] - ys[1]).toBeCloseTo(12);
    });

    it("빈 입력은 빈 출력", () => {
        expect(layoutReadoutRows([], range, 12)).toEqual([]);
    });
});
