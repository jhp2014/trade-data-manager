import { describe, expect, it } from "vitest";
import { followRange, zoomRange } from "./minuteFraming.js";

describe("followRange — 시각 선 따라가기", () => {
    const view = { from: 100, to: 200 }; // 폭 100

    it("선이 안쪽이면 옮기지 않는다", () => {
        expect(followRange(view, 150)).toBeNull();
        expect(followRange(view, 106)).toBeNull();
        expect(followRange(view, 194)).toBeNull();
    });

    it("오른쪽 가장자리(5%)를 넘으면 폭 그대로, 선이 오른쪽에서 30% 안쪽(= 70% 자리)에", () => {
        const r = followRange(view, 196)!;
        expect(r.to - r.from).toBe(100);
        expect((196 - r.from) / 100).toBeCloseTo(0.7);
        const far = followRange(view, 400)!; // 화면 밖 멀리
        expect((400 - far.from) / 100).toBeCloseTo(0.7);
    });

    it("왼쪽 가장자리를 넘으면 선이 왼쪽에서 30% 자리에", () => {
        const r = followRange(view, 104)!;
        expect(r.to - r.from).toBe(100);
        expect((104 - r.from) / 100).toBeCloseTo(0.3);
    });
});

describe("zoomRange — f 줌", () => {
    it("기준 봉을 가운데로 bars 봉(왼쪽 여백 10봉)", () => {
        expect(zoomRange(300, 200)).toEqual({ from: 190, to: 400 });
    });
});
