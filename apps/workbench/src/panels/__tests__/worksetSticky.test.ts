// 붙는 머리 두 층의 산술 — jsdom 은 **스크롤이 안 돼**(scrollTop 붙박이 0) dom 테스트가 startIndex 0 인
// 자명한 경로만 지난다(붙는 머리 회귀가 통째로 안 잡힌다). 그래서 선정·밀어올리기를 순수 함수로 빼고 여기서 잠근다.
import { describe, it, expect } from "vitest";
import { BAND_H, ROW_H, indexAt, rowStarts, stickyDateOf, stickyStockAt, stockPushOf, type StickyRowKind } from "../worksetSticky.js";

/** 날짜 하나에 종목 여럿, 종목마다 타점 n개 — "d 2 2" = 날짜 아래 종목 둘이 각각 타점 2개. */
function layout(...stocks: number[]): StickyRowKind[] {
    const out: StickyRowKind[] = ["date"];
    for (const n of stocks) {
        out.push("stock");
        for (let i = 0; i < n; i++) out.push("point");
    }
    return out;
}

describe("rowStarts", () => {
    it("행 종류대로 누적한다", () => {
        expect(rowStarts(layout(2))).toEqual([0, ROW_H.date, 48, 48 + ROW_H.point]);
    });
});

describe("indexAt — 스크롤 오프셋이 걸친 행", () => {
    const starts = rowStarts(layout(2)); // [0, 24, 48, 70]

    it("행 경계는 **그 행부터**다(<=) — 띠 갈아끼우는 문턱이 한 프레임 밀리지 않게", () => {
        expect(indexAt(starts, 0)).toBe(0);
        expect(indexAt(starts, 23)).toBe(0);
        expect(indexAt(starts, 24)).toBe(1);
        expect(indexAt(starts, 47)).toBe(1);
        expect(indexAt(starts, 48)).toBe(2);
    });

    it("끝을 넘어가면 마지막 행, 빈 목록은 0", () => {
        expect(indexAt(starts, 10_000)).toBe(3);
        expect(indexAt([], 0)).toBe(0);
    });
});

describe("stickyDateOf — 지금 구간의 날짜 머리", () => {
    const kinds = [...layout(2, 2), ...layout(1)]; // 날 A(종목 2개) + 날 B(종목 1개)

    it("그 구간을 여는 날짜 머리", () => {
        // 0:date 1:stock 2:point 3:point 4:stock 5:point 6:point 7:date 8:stock 9:point
        expect(stickyDateOf(kinds, 3)).toBe(0);
        expect(stickyDateOf(kinds, 6)).toBe(0);
    });

    it("새 날이 열리면 그 날로 갈아탄다", () => {
        expect(stickyDateOf(kinds, 7)).toBe(7);
        expect(stickyDateOf(kinds, 9)).toBe(7);
    });

    it("빈 목록은 머리도 없다", () => {
        expect(stickyDateOf([], 0)).toBe(-1);
    });
});

describe("stockPushOf — 다음 머리가 띠 안으로 들어오면 민다", () => {
    const kinds = layout(2, 2); // 0:date 1:stock 2,3:point 4:stock 5,6:point
    const starts = rowStarts(kinds);

    it("다음 종목이 아직 멀면 안 민다", () => {
        expect(stockPushOf(kinds, starts, 1, 0)).toBe(0);
    });

    it("다음 종목이 띠 안으로 들어온 만큼 음수로 민다 — 띠가 그 행을 삼키지 않는다", () => {
        const next = starts[4]!; // 두 번째 종목 행의 시작
        // 스크롤이 next - BAND_H 를 넘어서는 순간부터 밀리기 시작한다
        expect(stockPushOf(kinds, starts, 1, next - BAND_H)).toBe(0);
        expect(stockPushOf(kinds, starts, 1, next - BAND_H + 10)).toBe(-10);
    });

    it("마지막 덩어리는 뒤에서 밀 것이 없다", () => {
        expect(stockPushOf(kinds, starts, 4, 10_000)).toBe(0);
    });

    it("붙은 종목이 없으면(-1) 0", () => {
        expect(stockPushOf(kinds, starts, -1, 500)).toBe(0);
    });
});

// 띠(WorksetList)는 붙는 두 행을 **목록에서 빼고** 자기가 그린다. 그래서 "붙은 자리가 자연 자리보다
// 위로 가지 않는다"가 성립해야 행이 튀지 않는데, 이건 함수 하나가 아니라 **합성**의 성질이라 값 단언으로는
// 안 잡힌다. 오프셋을 쓸며 부등식으로 잠근다 — 화면에서만 보이던 주장을 순수 함수 층으로 내린다.
describe("합성 불변식 — 띠가 그려도 자리가 안 튄다", () => {
    const kinds = [...layout(2, 0, 3), ...layout(1)]; // 타점 0개 종목(등호가 나는 자리)과 새 날 경계를 함께
    const starts = rowStarts(kinds);
    const total = starts[starts.length - 1]! + ROW_H[kinds[kinds.length - 1]!];

    it("모든 스크롤 위치에서 붙은 자리 ≥ 자연 자리, 그리고 띠 안((0, 24])을 안 벗어난다", () => {
        for (let y = 0; y <= total; y += 2) {
            const d = stickyDateOf(kinds, indexAt(starts, y));
            expect(y).toBeGreaterThanOrEqual(starts[d]!); // 날짜 머리: 띠 자리(=y) 가 자연 자리 이상
            const s = stickyStockAt(kinds, starts, d, y + ROW_H.date);
            if (s < 0) continue;
            const seat = y + ROW_H.date + stockPushOf(kinds, starts, s, y);
            expect(seat).toBeGreaterThanOrEqual(starts[s]!); // 종목 머리도 같은 규칙
            // 날짜 머리 위로 솟지도(≤0), 띠 밖으로 사라지지도(>24) 않는다.
            expect(seat - y).toBeGreaterThan(0);
            expect(seat - y).toBeLessThanOrEqual(ROW_H.date);
        }
    });
});

describe("stickyStockAt — 갈아끼우는 문턱은 띠 바닥(픽셀)이다", () => {
    const kinds = layout(2, 2); // 0:date 1:stock 2,3:point 4:stock 5,6:point
    const starts = rowStarts(kinds);
    const y = (scrollOffset: number): number => scrollOffset + ROW_H.date;

    it("맨 위에선 첫 종목이 붙는다", () => {
        expect(stickyStockAt(kinds, starts, 0, y(0))).toBe(1);
    });

    it("다음 종목이 띠 바닥에 닿는 순간 이어받는다 — 밀어올리기가 딱 다 된 자리와 같은 문턱", () => {
        const next = starts[4]!;
        const handoff = next - ROW_H.date; // 이 scrollOffset 에서 교체
        expect(stickyStockAt(kinds, starts, 0, y(handoff - 1))).toBe(1);
        expect(stickyStockAt(kinds, starts, 0, y(handoff))).toBe(4);
        // 같은 자리에서 앞 머리는 정확히 띠 밖으로 밀려나 있다(이음매가 안 튄다).
        expect(stockPushOf(kinds, starts, 1, handoff)).toBe(-ROW_H.stock);
    });

    it("다음 날짜 머리가 그 자리까지 오면 붙일 종목이 없다 — 앞 날 종목을 붙여 두지 않는다", () => {
        const two = [...layout(1), ...layout(1)]; // 0:date 1:stock 2:point 3:date 4:stock 5:point
        const s2 = rowStarts(two);
        expect(stickyStockAt(two, s2, 0, s2[3]! - 1)).toBe(1);
        expect(stickyStockAt(two, s2, 0, s2[3]!)).toBe(-1);
    });
});
