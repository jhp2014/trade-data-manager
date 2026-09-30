import { describe, expect, it } from "vitest";
import { descendingOrdinals } from "@trade-data-manager/market/domain";
import {
    DEFAULT_RATE_TICKS,
    commitRateTicks,
    layoutRateTicks,
    parseRateTicks,
    parseTickInput,
    rateTickCounts,
    tickLabelParts,
} from "../rateTicks.js";

/** 순위 공간 그대로의 px(1 순위 = 10px) — 뷰 [y0, y1]. */
const FAR = { top: -1000, bottom: 1e6 };
const scale = (y0: number, y1: number) => ({ px: (v: number) => v * 10, inDomain: (v: number) => v >= y0 && v <= y1 });

describe("parseRateTicks — 관대한 파서", () => {
    it("배열이 아니면 기본값 · [] 는 끔 그대로", () => {
        expect(parseRateTicks(undefined)).toEqual([...DEFAULT_RATE_TICKS]);
        expect(parseRateTicks("x")).toEqual([...DEFAULT_RATE_TICKS]);
        expect(parseRateTicks([])).toEqual([]);
    });
    it("유한값·범위 안만, 소수 1자리, 중복 제거, 오름차순, 앞에서 8개", () => {
        expect(parseRateTicks([10, "5", NaN, 5, 40, -31, 2.345, 10.04])).toEqual([2.3, 5, 10]);
        expect(parseRateTicks([9, 8, 7, 6, 5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
    it("커밋은 범위 밖을 끝으로 붙인다(조용히 버리지 않는다)", () => {
        expect(commitRateTicks([45, -40, 5])).toEqual([-30, 5, 30]);
    });
});

describe("rateTickCounts — count + 0.5 가 정확한 경계", () => {
    it("동점·결손 — 5,5,3,null 에서 X=5 → 2 (≥ 포함, 결손 제외)", () => {
        expect(rateTickCounts([5, 5, 3, null], [5, 0, 6])).toEqual([{ pct: 5, count: 2 }, { pct: 0, count: 3 }, { pct: 6, count: 0 }]);
    });
    it("경쟁 순위와 맞물린다 — X 이상은 전부 순위 ≤ count, 미만은 전부 > count", () => {
        const rates = [12.3, 5, 5, 4.99, 0, -1, null, 29.9];
        const ords = descendingOrdinals(rates);
        for (const X of [-1, 0, 4.99, 5, 10, 30]) {
            const [{ count }] = rateTickCounts(rates, [X]);
            rates.forEach((r, i) => {
                if (r === null) return;
                if (r >= X) expect(ords[i]!).toBeLessThanOrEqual(count);
                else expect(ords[i]!).toBeGreaterThan(count);
            });
        }
    });
});

describe("layoutRateTicks — 배치", () => {
    it("count 0 은 선 없음 · 뷰 밖은 위/아래 가장자리로", () => {
        const l = layoutRateTicks([{ pct: 20, count: 0 }, { pct: 10, count: 3 }, { pct: 5, count: 30 }, { pct: 0, count: 150 }], scale(5, 100), 5, FAR);
        expect(l.lines).toEqual([{ pct: 5, py: 305 }]);
        expect(l.above).toEqual([10]);
        expect(l.below).toEqual([0]);
    });
    it("12px 안으로 붙으면 글자 합침(작은 값부터) · 같은 count 도 한 묶음 · 선은 전부", () => {
        const l = layoutRateTicks([{ pct: 20, count: 4 }, { pct: 10, count: 5 }, { pct: 5, count: 20 }, { pct: 4, count: 20 }], scale(1, 200), 1, FAR);
        expect(l.lines).toHaveLength(4);
        expect(l.labels.map((g) => g.parts)).toEqual([[10, 20], [4, 5]]);
        expect(l.labels[0].py).toBe(50);
    });
    it("떨어진 선은 따로", () => {
        const l = layoutRateTicks([{ pct: 10, count: 4 }, { pct: 5, count: 6 }], scale(1, 200), 1, FAR);
        expect(l.labels.map((g) => g.parts)).toEqual([[10], [5]]);
    });
});

describe("tickLabelParts — 글자 조각", () => {
    const text = (parts: number[], max?: number): string => tickLabelParts(parts, max).map((c) => c.text).join("");
    it("부호 색 · 둘까지는 「·」, 넘으면 양끝만", () => {
        expect(text([-5, 0])).toBe("−5·0%");
        expect(tickLabelParts([-5, 5]).filter((c) => c.tone !== null).map((c) => c.tone)).toEqual(["fall", "rise"]);
        expect(text([-10, -5, 0])).toBe("−10…0%");
        expect(text([10, 20], 1)).toBe("10…20%");
        expect(text([10], 1)).toBe("10%");
    });
});

describe("layoutRateTicks — 가장자리 글자 곁에선 뷰 안 글자가 비킨다", () => {
    it("위 가장자리(↑)가 서면 그 12px 안의 글자는 밀려 앉고, 밀려 붙은 것끼리 합친다 · 선은 제자리", () => {
        // 뷰 [3, 100] — 10%(count 1)는 위로 벗어남, 7%(count 3 → py 35)·6%(count 4 → py 45)는 뷰 안.
        const l = layoutRateTicks([{ pct: 10, count: 1 }, { pct: 7, count: 3 }, { pct: 6, count: 4 }], scale(3, 100), 3, { top: 40, bottom: 900 });
        expect(l.above).toEqual([10]);
        expect(l.lines.map((x) => x.py)).toEqual([35, 45]);
        expect(l.labels).toEqual([{ py: 52, parts: [6, 7] }]);
    });
    it("가장자리 목록은 작은 값부터", () => {
        const l = layoutRateTicks([{ pct: 20, count: 1 }, { pct: 10, count: 2 }], scale(5, 100), 5, FAR);
        expect(l.above).toEqual([10, 20]);
    });
});

describe("parseTickInput — 칩 글자", () => {
    it("표시 모양(− · %)과 + 를 받는다 · 빈칸 = 삭제 · 못 읽으면 null(취소)", () => {
        expect(parseTickInput(" −5% ")).toBe(-5);
        expect(parseTickInput("+7.5")).toBe(7.5);
        expect(parseTickInput("")).toBe("");
        expect(parseTickInput("abc")).toBeNull();
    });
});
