import { describe, expect, it } from "vitest";
import { moveItem } from "@/lib/reorder";

describe("moveItem", () => {
  it("아래로(+1)/위로(-1) 이웃과 맞바꾼다", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("경계를 벗어나면 같은 참조를 그대로 반환한다(no-op)", () => {
    const arr = ["a", "b", "c"];
    expect(moveItem(arr, 0, -1)).toBe(arr); // 맨 위에서 위로
    expect(moveItem(arr, 2, 1)).toBe(arr); // 맨 아래에서 아래로
  });

  it("index 가 -1(미발견)이면 no-op", () => {
    const arr = ["a", "b"];
    expect(moveItem(arr, -1, 1)).toBe(arr);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const arr = ["a", "b", "c"];
    const next = moveItem(arr, 0, 1);
    expect(arr).toEqual(["a", "b", "c"]);
    expect(next).not.toBe(arr);
  });
});
