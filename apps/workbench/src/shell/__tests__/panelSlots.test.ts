import { describe, expect, it } from "vitest";
import { nextFreeSlot, parseSlotId, slotIdOf } from "../panelSlots.js";

describe("parseSlotId", () => {
    it("밑동에 하이픈이 있어도 꼬리 숫자만 슬롯 번호로 읽는다", () => {
        expect(parseSlotId("chart-1")).toEqual({ base: "chart", n: 1 });
        expect(parseSlotId("hot-points-2")).toEqual({ base: "hot-points", n: 2 });
        expect(parseSlotId("live-chart-12")).toEqual({ base: "live-chart", n: 12 });
    });

    it("슬롯 문법이 아니면 null — 번호 없음·0·앞자리 0", () => {
        expect(parseSlotId("chart")).toBeNull();
        expect(parseSlotId("chart-0")).toBeNull();
        expect(parseSlotId("chart-01")).toBeNull();
        expect(parseSlotId("")).toBeNull();
    });

    it("slotIdOf 와 왕복이 항등이다", () => {
        for (const id of ["chart-1", "hot-points-3", "a-b-c-7"]) {
            const s = parseSlotId(id)!;
            expect(slotIdOf(s.base, s.n)).toBe(id);
        }
    });
});

describe("nextFreeSlot", () => {
    it("빈 대장이면 1", () => {
        expect(nextFreeSlot("chart", [])).toBe(1);
    });

    it("닫힌(소멸된) 최소 번호를 재사용한다", () => {
        expect(nextFreeSlot("chart", ["chart-1", "chart-3"])).toBe(2);
        expect(nextFreeSlot("chart", ["chart-2"])).toBe(1);
        expect(nextFreeSlot("chart", ["chart-1", "chart-2"])).toBe(3);
    });

    it("다른 밑동의 슬롯은 안 센다 — chart 와 live-chart 가 서로를 막지 않는다", () => {
        expect(nextFreeSlot("chart", ["live-chart-1", "chart-1"])).toBe(2);
        expect(nextFreeSlot("live-chart", ["live-chart-1", "chart-2"])).toBe(2);
    });
});
