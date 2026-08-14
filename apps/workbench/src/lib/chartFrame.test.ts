import { describe, expect, it } from "vitest";
import { linePct, snapToBar, type RenderLine } from "./chartFrame.js";

// 분봉 % 축의 선 좌표 규칙 — 분자·분모 스케일 일치(D=수정주가 전일종가 / M·A=당일 원주가).
// 렌더(usePercentPriceLines)와 우클릭 판정이 같은 함수를 타므로, 여기가 어긋나면 선이
// 보이는 자리와 지워지는 자리가 갈라진다 — 그래서 규칙을 값으로 잠근다.
describe("linePct", () => {
    const line = (kind: RenderLine["kind"], price: number): RenderLine => ({ id: "l1", price, kind });

    it("D 선은 pctBase(수정주가 전일종가)로 나눈다", () => {
        expect(linePct(line("D", 11000), 999999, 10000)).toBeCloseTo(10);
    });

    it("M·A 선은 base(당일 원주가)로 나눈다", () => {
        expect(linePct(line("M", 10500), 10000, 999999)).toBeCloseTo(5);
        expect(linePct(line("A", 9000), 10000, 999999)).toBeCloseTo(-10);
    });

    it("분모가 없거나 0 이하면 null — 지어낸 자리에 선을 세우지 않는다", () => {
        expect(linePct(line("D", 11000), 10000, null)).toBeNull();
        expect(linePct(line("M", 11000), null, 10000)).toBeNull();
        expect(linePct(line("M", 11000), 0, 10000)).toBeNull();
    });
});

describe("snapToBar", () => {
    const bars = [{ time: 100 }, { time: 160 }, { time: 220 }];

    it("target 이하 마지막 봉으로 스냅한다(정확히 일치하면 그 봉)", () => {
        expect(snapToBar(bars, 200)).toBe(160);
        expect(snapToBar(bars, 160)).toBe(160);
        expect(snapToBar(bars, 10_000)).toBe(220);
    });

    it("이전 봉이 없거나 target 이 없으면 null", () => {
        expect(snapToBar(bars, 50)).toBeNull();
        expect(snapToBar(bars, null)).toBeNull();
        expect(snapToBar([], 100)).toBeNull();
    });
});
