import { describe, expect, it } from "vitest";
import { indexAtOrBefore, linePct, snapToBar, type RenderLine } from "./chartFrame.js";

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

// a/d 이동·f 줌 앵커의 "이전 봉" 인덱스 — snapToBar 와 달리 **첫 봉보다 이르면 0**(첫 봉)이다.
// 막는 회귀: 폴백 기본값(length-1)이 남아 개장 전 앵커가 세션 끝(마지막 봉)으로 튀던 버그.
describe("indexAtOrBefore", () => {
    const bars = [{ t: 100 }, { t: 200 }, { t: 300 }];
    const keyOf = (b: { t: number }): number => b.t;

    it("target 이하 마지막 봉 인덱스(정확 일치·사이 시각·전부보다 뒤)", () => {
        expect(indexAtOrBefore(bars, 200, keyOf)).toBe(1);
        expect(indexAtOrBefore(bars, 250, keyOf)).toBe(1);
        expect(indexAtOrBefore(bars, 999, keyOf)).toBe(2);
        expect(indexAtOrBefore(bars, 100, keyOf)).toBe(0);
    });

    it("첫 봉보다 이전이면 첫 봉(0) — 마지막 봉으로 튀지 않는다(회귀)", () => {
        expect(indexAtOrBefore(bars, 50, keyOf)).toBe(0);
    });

    it("빈 배열은 -1", () => {
        expect(indexAtOrBefore([], 100, keyOf)).toBe(-1);
    });

    it("문자열 키(HH:MM:SS)도 같은 규칙 — a/d 이동(tradeTime)이 쓴다", () => {
        const tBars = [{ t: "09:00:00" }, { t: "09:01:00" }, { t: "09:02:00" }];
        const key = (b: { t: string }): string => b.t;
        expect(indexAtOrBefore(tBars, "09:01:30", key)).toBe(1);
        expect(indexAtOrBefore(tBars, "08:30:00", key)).toBe(0); // 개장 전 시각 → 첫 봉
    });
});
