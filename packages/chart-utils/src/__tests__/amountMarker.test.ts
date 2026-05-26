import { describe, it, expect } from "vitest";
import { amountMarkerFor } from "../amountMarker";
import { highMarkerColor, amountMarkerColor, HIGH_MARKER_MIN_PCT } from "../colors";

describe("amountMarkerFor", () => {
    it("null/0/음수/NaN/Infinity 입력은 null", () => {
        expect(amountMarkerFor(null)).toBeNull();
        expect(amountMarkerFor(undefined)).toBeNull();
        expect(amountMarkerFor(0)).toBeNull();
        expect(amountMarkerFor(-100)).toBeNull();
        expect(amountMarkerFor(NaN)).toBeNull();
        expect(amountMarkerFor(Infinity)).toBeNull();
    });

    it("최소 임계(30억) 미만이면 null", () => {
        expect(amountMarkerFor(29 * 1e8)).toBeNull();
    });

    it("임계를 만족하는 가장 큰 값을 텍스트로 반환", () => {
        // 75억 → 70 매칭
        expect(amountMarkerFor(75 * 1e8)?.text).toBe("70");
        // 정확히 100억 → 100 매칭
        expect(amountMarkerFor(100 * 1e8)?.text).toBe("100");
        // 1000억 → 300 매칭 (배열 최대값)
        expect(amountMarkerFor(1000 * 1e8)?.text).toBe("300");
    });
});

describe("highMarkerColor", () => {
    it("최소 임계 미만은 null", () => {
        expect(highMarkerColor(HIGH_MARKER_MIN_PCT - 0.1)).toBeNull();
        expect(highMarkerColor(0)).toBeNull();
    });

    it("임계대별로 다른 색상 반환", () => {
        const c1 = highMarkerColor(12);
        const c2 = highMarkerColor(17);
        const c3 = highMarkerColor(22);
        const c4 = highMarkerColor(27);
        const c5 = highMarkerColor(50);
        expect(new Set([c1, c2, c3, c4, c5]).size).toBe(5);
    });
});

describe("amountMarkerColor", () => {
    it("임계대별로 다른 색상 반환", () => {
        const c1 = amountMarkerColor(30);
        const c2 = amountMarkerColor(60);
        const c3 = amountMarkerColor(90);
        const c4 = amountMarkerColor(100);
        const c5 = amountMarkerColor(300);
        expect(new Set([c1, c2, c3, c4, c5]).size).toBe(5);
    });
});
