// 코덱 왕복 보존 — 위치가 계약인 튜플이라, 필드 하나가 밀리면 여기서 잡혀야 한다.
import { describe, expect, it } from "vitest";
import { decodeChartGrid, encodeChartGrid } from "../codec.js";
import type { PointGrid } from "../grid.js";

describe("grid codec", () => {
    it("encode→decode 왕복이 원본과 deep-equal(널·미확정·크로싱 포함)", () => {
        const grid: PointGrid = {
            base: 4500.000123,
            touch: { min: 550, tv: "300000000", cum: "1300000000" },
            pivots: [
                { kind: "high", min: 560, price: 10450, confirmedMin: 562, cum: "2595000000", cross: null },
                { kind: "low", min: 563, price: 10000, confirmedMin: null, cum: "3595000000", cross: null },
                { kind: "high", min: 570, price: 10700, confirmedMin: 573, cum: "6695000000", cross: { min: 566, tv: "400000000", cum: "5895000000" } },
            ],
            newHighs: [
                { min: 541, open: 10100, high: 10210, low: 10050, close: 10210, tv: "2000000000", cum: "2000000000" },
                { min: 560, open: 10450, high: 10450, low: 10300, close: 10310, tv: "10050000", cum: "2595000000" },
            ],
            prevBase: 9990.5,
            prevBaseKrx: 9985,
        };
        const decoded = decodeChartGrid(encodeChartGrid("005930", grid));
        expect(decoded.stockCode).toBe("005930");
        expect(decoded.grid).toEqual(grid);
    });

    it("무사건·미터치 격자(널 투성이)도 보존된다", () => {
        const grid: PointGrid = { base: null, touch: null, pivots: [], newHighs: [], prevBase: null, prevBaseKrx: null };
        expect(decodeChartGrid(encodeChartGrid("A", grid)).grid).toEqual(grid);
    });

    it("옛 버전 튜플(칸 수 부족)은 조용히 오독하지 않고 죽는다", () => {
        const old = ["A", 100, 541, [], [], 98, 97] as unknown as Parameters<typeof decodeChartGrid>[0];
        expect(() => decodeChartGrid(old)).toThrow(/칸 수 7/);
    });

    it("튜플 위치 자체를 고정한다 — 왕복만으론 encode·decode 가 같은 방향으로 밀린 걸 못 잡는다", () => {
        const grid: PointGrid = {
            base: 100,
            touch: { min: 541, tv: "7", cum: "8" },
            pivots: [
                { kind: "low", min: 540, price: 9900, confirmedMin: null, cum: "77", cross: null },
                { kind: "high", min: 545, price: 9990, confirmedMin: 546, cum: "99", cross: { min: 543, tv: "11", cum: "88" } },
            ],
            newHighs: [{ min: 541, open: 1, high: 2, low: 3, close: 4, tv: "5", cum: "6" }],
            prevBase: 98,
            prevBaseKrx: 97,
        };
        expect(encodeChartGrid("A", grid)).toEqual([
            "A",
            100,
            541,
            [
                [1, 540, 9900, -1, "77", -1, "-1", "-1"],
                [0, 545, 9990, 546, "99", 543, "11", "88"],
            ],
            [[541, 1, 2, 3, 4, "5", "6"]],
            98,
            97,
            "7",
            "8",
        ]);
    });
});
