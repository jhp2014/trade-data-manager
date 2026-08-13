import { describe, it, expect } from "vitest";
import { clamp, clamp01, clampIndex, median } from "../num.js";

describe("clamp", () => {
    it("범위 안은 그대로, 밖은 끝으로", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(11, 0, 10)).toBe(10);
    });
});

describe("clamp01 — 유한하지 않으면 한가운데", () => {
    it("0..1 로 가둔다", () => {
        expect(clamp01(0.3)).toBe(0.3);
        expect(clamp01(-2)).toBe(0);
        expect(clamp01(2)).toBe(1);
    });

    // 두 벌로 갈려 있던 자리가 정확히 여기다: 한쪽은 0.5 로 받아냈고 다른 쪽은 NaN 을 흘렸다.
    // 이 값은 그대로 calc() 에 들어가므로 NaN 이 새면 그 선언이 통째로 무효가 된다(요소가 사라진다).
    it("NaN·Infinity 는 0.5 — 무효 CSS 로 새지 않게", () => {
        expect(clamp01(NaN)).toBe(0.5);
        expect(clamp01(Infinity)).toBe(0.5);
        expect(clamp01(-Infinity)).toBe(0.5);
        expect(clamp01(0 / 0)).toBe(0.5); // 도메인이 비어 척도가 0/0 이 되는 순간
    });
});

describe("clampIndex — 배열 자리로", () => {
    it("[0, len-1] 안으로 가두고 반올림한다", () => {
        expect(clampIndex(2.6, 5)).toBe(3);
        expect(clampIndex(-3, 5)).toBe(0);
        expect(clampIndex(99, 5)).toBe(4);
    });

    it("빈 배열이면 0 — 음수 자리를 만들지 않는다", () => {
        expect(clampIndex(3, 0)).toBe(0);
    });
});

describe("median — 무리의 한복판", () => {
    it("정렬해서 가운데를 집는다(원본은 안 건드린다)", () => {
        const v = [5, 1, 3];
        expect(median(v)).toBe(3);
        expect(v).toEqual([5, 1, 3]);
    });

    it("이상치가 끌고 가지 않는다 — 평균이 아닌 이유", () => {
        expect(median([1, 2, 3, 1000])).toBe(3);
    });

    it("빈 배열은 0", () => {
        expect(median([])).toBe(0);
    });
});
