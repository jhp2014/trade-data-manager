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
                { kind: "high", min: 560, price: 10450, confirmedMin: 562, legAmount: "2595000000", renewalAmount: null },
                { kind: "low", min: 563, price: 10000, confirmedMin: null, legAmount: "1000000000", renewalAmount: null },
                { kind: "high", min: 570, price: 10700, confirmedMin: 573, legAmount: "3100000000", renewalAmount: "1200000000" },
            ],
            newHighs: [
                { min: 541, open: 10100, high: 10210, low: 10050, close: 10210, tv: "2000000000" },
                { min: 560, open: 10450, high: 10450, low: 10300, close: 10310, tv: "10050000" },
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

    it("튜플 위치 자체를 고정한다 — 왕복만으론 encode·decode 가 같은 방향으로 밀린 걸 못 잡는다", () => {
        const grid: PointGrid = {
            base: 100,
            touchMin: 541,
            pivots: [
                { kind: "low", min: 540, price: 9900, confirmedMin: null, legAmount: "77", renewalAmount: null },
                { kind: "high", min: 545, price: 9990, confirmedMin: 546, legAmount: "99", renewalAmount: "55" },
            ],
            newHighs: [{ min: 541, open: 1, high: 2, low: 3, close: 4, tv: "5" }],
        };
        expect(encodeChartGrid("A", grid)).toEqual([
            "A",
            100,
            541,
            [
                [1, 540, 9900, -1, "77", "-1"],
                [0, 545, 9990, 546, "99", "55"],
            ],
            [[541, 1, 2, 3, 4, "5"]],
        ]);
    });
});
