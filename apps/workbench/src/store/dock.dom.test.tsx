// 마지막 배치 읽기 — 자동저장이 붙으면서 **부팅이 저장값에 매이므로**, 저장이 깨져도 부팅이 죽지
// 않는지가 본론이다. 기본 배치가 빈 도화지라 "못 읽으면 null" 이 곧 안전한 폴백이다.
// localStorage 를 쓰므로 jsdom(.dom).
import { describe, it, expect, beforeEach } from "vitest";
import { loadLastLayout } from "./dock.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asLayout = (o: unknown): any => o;
const seed = (v: unknown): void => localStorage.setItem("wb.layout.last", JSON.stringify(v));

beforeEach(() => localStorage.clear());

describe("loadLastLayout", () => {
    it("저장이 없으면 null(= 빈 도화지)", () => {
        expect(loadLastLayout()).toBeNull();
    });

    it("JSON 이 깨졌으면 null — 부팅이 죽지 않는다", () => {
        localStorage.setItem("wb.layout.last", "{not json");
        expect(loadLastLayout()).toBeNull();
    });

    it("삭제된 패널이 섞여 있으면 걸러내고 나머지를 살린다", () => {
        seed({
            grid: {
                root: { type: "leaf", data: { views: ["chart-1", "hypothesis-1"], activeView: "hypothesis-1", id: "g1" } },
                height: 100, width: 100, orientation: "HORIZONTAL",
            },
            panels: {
                "chart-1": { id: "chart-1", contentComponent: "chart" },
                "hypothesis-1": { id: "hypothesis-1", contentComponent: "hypothesis" },
            },
        });
        const out = asLayout(loadLastLayout());
        expect(Object.keys(out.panels)).toEqual(["chart-1"]);
        expect(out.grid.root.data.views).toEqual(["chart-1"]);
        expect(out.grid.root.data.activeView).toBe("chart-1");
    });

    it("빈 배치(도화지)도 그대로 살린다 — 창을 다 닫아 둔 것도 배치다", () => {
        seed({ grid: { root: { type: "branch", data: [] }, height: 100, width: 100, orientation: "HORIZONTAL" }, panels: {} });
        expect(loadLastLayout()).not.toBeNull();
        expect(asLayout(loadLastLayout()).panels).toEqual({});
    });
});
