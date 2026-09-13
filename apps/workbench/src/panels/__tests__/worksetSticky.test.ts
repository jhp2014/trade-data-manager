// 붙는 머리 두 층의 산술 — jsdom 은 스크롤 상자 높이가 0 이라 dom 테스트가 startIndex 0 인 자명한
// 경로만 지난다(붙는 머리 회귀가 통째로 안 잡힌다). 그래서 선정·밀어올리기를 순수 함수로 빼고 여기서 잠근다.
import { describe, it, expect } from "vitest";
import { BAND_H, ROW_H, rowStarts, stickyHeadsOf, stickyStockAt, stockPushOf, type StickyRowKind } from "../worksetSticky.js";

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

describe("stickyHeadsOf — 지금 구간의 머리 둘", () => {
    const kinds = [...layout(2, 2), ...layout(1)]; // 날 A(종목 2개) + 날 B(종목 1개)

    it("종목 블록 안이면 그 날짜와 그 종목", () => {
        // 0:date 1:stock 2:point 3:point 4:stock 5:point 6:point 7:date 8:stock 9:point
        expect(stickyHeadsOf(kinds, 3)).toEqual({ date: 0, stock: 1 });
        expect(stickyHeadsOf(kinds, 6)).toEqual({ date: 0, stock: 4 });
    });

    it("새 날이 열린 자리에선 앞 날의 종목이 따라 붙지 않는다", () => {
        expect(stickyHeadsOf(kinds, 7)).toEqual({ date: 7, stock: -1 });
    });

    it("맨 위(첫 날짜 머리)에선 종목이 아직 없다", () => {
        expect(stickyHeadsOf(kinds, 0)).toEqual({ date: 0, stock: -1 });
    });

    it("빈 목록은 머리도 없다", () => {
        expect(stickyHeadsOf([], 0)).toEqual({ date: -1, stock: -1 });
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
