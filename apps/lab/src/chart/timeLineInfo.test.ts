import { describe, expect, it } from "vitest";
import { infoBoxLeft } from "./timeLineInfo.js";

describe("infoBoxLeft", () => {
    it("선 오른쪽에 붙는다", () => expect(infoBoxLeft(100, 150, 600)).toBe(104));
    it("오른쪽으로 넘치면 선 왼쪽으로", () => expect(infoBoxLeft(500, 150, 600)).toBe(500 - 4 - 150));
    it("양쪽 다 넘치면(좁은 차트) 오른쪽 그대로", () => expect(infoBoxLeft(100, 300, 320)).toBe(104));
    it("폭을 아직 모르면 오른쪽", () => expect(infoBoxLeft(590, 0, 600)).toBe(594));
});
