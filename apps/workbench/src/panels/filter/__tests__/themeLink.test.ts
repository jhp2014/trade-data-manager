import { describe, it, expect } from "vitest";
import { nextLinkedId } from "../themeLink.js";

// 연동 행이 사라졌을 때 어디로 가나 — 삭제 입구가 보드 밖(막대 목록·집합 적용)에도 있어 순수 해석기가 진다.
describe("nextLinkedId", () => {
    it("살아 있으면 그대로", () => {
        expect(nextLinkedId(["a", "b"], ["a", "b"], "b")).toBe("b");
    });

    it("사라지면 이전 목록에서의 다음 생존자로", () => {
        expect(nextLinkedId(["a", "b", "c"], ["a", "c"], "b")).toBe("c");
    });

    it("다음이 없으면 이전 생존자로", () => {
        expect(nextLinkedId(["a", "b"], ["a"], "b")).toBe("a");
    });

    it("이전 목록을 모르는 id(통째 교체)면 첫 행으로", () => {
        expect(nextLinkedId(["a", "b"], ["x", "y"], "b")).toBe("x");
        expect(nextLinkedId([], ["x"], "gone")).toBe("x");
    });

    it("목록이 비면 null", () => {
        expect(nextLinkedId(["a"], [], "a")).toBeNull();
    });
});
