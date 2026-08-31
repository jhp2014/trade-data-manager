// 코덱 왕복 보존 — 위치가 계약인 튜플이라, 필드 하나가 밀리면 여기서 잡혀야 한다.
import { describe, expect, it } from "vitest";
import { decodeChartGrid, encodeChartGrid } from "../codec.js";
import type { PointGrid } from "../grid.js";

describe("grid codec", () => {
    it("encode→decode 왕복이 원본과 deep-equal(널·미확정 포함)", () => {
        const grid: PointGrid = {
            base: 4500.000123,
            touchMin: 550,
            pivots: [
                { kind: "low", min: 540, price: 10000, confirmedMin: 542, legAmount: "1000000000" },
                { kind: "high", min: 560, price: 10450, confirmedMin: null, legAmount: "2595000000" },
            ],
            newHighs: [
                { min: 541, high: 10210, tv: "2000000000", tvMax2: "2000000000", bull: true },
                { min: 560, high: 10450, tv: "10050000", tvMax2: "2000000000", bull: false },
            ],
        };
        const decoded = decodeChartGrid(encodeChartGrid("005930", grid));
        expect(decoded.stockCode).toBe("005930");
        expect(decoded.grid).toEqual(grid);
    });

    it("무사건·미터치 격자(널 투성이)도 보존된다", () => {
        const grid: PointGrid = { base: null, touchMin: null, pivots: [], newHighs: [] };
        expect(decodeChartGrid(encodeChartGrid("A", grid)).grid).toEqual(grid);
    });
});
