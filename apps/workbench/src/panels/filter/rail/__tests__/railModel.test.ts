import { describe, it, expect } from "vitest";
import { applyDrag, fracOfX, isTapRange, orderRanges, removeAt, type RailRange } from "../railModel.js";

// 값이 곧 프랙션인 가장 단순한 레일(V = number)로 규칙만 본다.
const toFrac = (v: number): number => v;
const fromFrac = (f: number): number => f;
const r = (from: number, to: number): RailRange<number> => ({ from, to });

describe("applyDrag — 빈 트랙 드래그는 새 구간", () => {
    it("누른 자리와 지금 자리가 양끝", () => {
        expect(applyDrag([], { kind: "new", anchorFrac: 0.2 }, 0.6, fromFrac)).toEqual([r(0.2, 0.6)]);
    });

    it("기존 구간 뒤에 덧붙는다(구간끼리 OR)", () => {
        expect(applyDrag([r(0, 0.1)], { kind: "new", anchorFrac: 0.5 }, 0.7, fromFrac)).toEqual([r(0, 0.1), r(0.5, 0.7)]);
    });

    it("single 레일은 덧붙이지 않고 갈아탄다 — 저장 자리가 하나뿐이라", () => {
        expect(applyDrag([r(0, 0.1)], { kind: "new", anchorFrac: 0.5 }, 0.7, fromFrac, { single: true })).toEqual([r(0.5, 0.7)]);
    });
});

describe("applyDrag — 경계 드래그는 그 경계만", () => {
    it("반대쪽 경계와 다른 구간은 손대지 않는다(안 건드린 앵커 보존)", () => {
        const before = [r(0.1, 0.4), r(0.6, 0.9)];
        const after = applyDrag(before, { kind: "edge", index: 1, edge: "from" }, 0.5, fromFrac);
        expect(after).toEqual([r(0.1, 0.4), r(0.5, 0.9)]);
        expect(after[0]).toBe(before[0]); // 참조까지 그대로 — V 를 새로 만들지 않는다
    });

    it("반대편을 지나쳐도 뒤집힌 채로 둔다(정렬은 커밋 때)", () => {
        expect(applyDrag([r(0.3, 0.6)], { kind: "edge", index: 0, edge: "from" }, 0.8, fromFrac)).toEqual([r(0.8, 0.6)]);
    });
});

describe("orderRanges — 커밋 전 정렬", () => {
    it("뒤집힌 구간만 바로잡는다", () => {
        expect(orderRanges([r(0.8, 0.6), r(0.1, 0.2)], toFrac)).toEqual([r(0.6, 0.8), r(0.1, 0.2)]);
    });
});

describe("isTapRange — 클릭은 구간이 아니다", () => {
    it("폭이 거의 0 이면 클릭", () => {
        expect(isTapRange(r(0.5, 0.5), toFrac)).toBe(true);
        expect(isTapRange(r(0.5, 0.504), toFrac)).toBe(true);
    });

    it("눈에 보이는 폭이면 구간", () => {
        expect(isTapRange(r(0.5, 0.56), toFrac)).toBe(false);
    });
});

describe("removeAt", () => {
    it("그 구간만 뺀다", () => {
        expect(removeAt([r(0, 0.1), r(0.2, 0.3), r(0.4, 0.5)], 1)).toEqual([r(0, 0.1), r(0.4, 0.5)]);
    });
});

describe("fracOfX — 트랙 좌표", () => {
    it("여백을 뺀 선 길이가 기준", () => {
        expect(fracOfX(20, 220, 20)).toBeCloseTo(0); // 선 길이 = 220 − 2*20 = 180
        expect(fracOfX(110, 220, 20)).toBeCloseTo(0.5);
        expect(fracOfX(200, 220, 20)).toBeCloseTo(1);
    });

    it("바깥으로 나가도 0..1 로 클램프", () => {
        expect(fracOfX(-50, 220, 20)).toBe(0);
        expect(fracOfX(9999, 220, 20)).toBe(1);
    });

    it("폭이 여백보다 작으면 0(0 나눗셈 방지)", () => {
        expect(fracOfX(10, 30, 20)).toBe(0);
    });
});
