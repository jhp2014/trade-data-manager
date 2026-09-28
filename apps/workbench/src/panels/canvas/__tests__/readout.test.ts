import { describe, it, expect } from "vitest";
import { layoutReadoutRows } from "../readout.js";

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
