import { beforeEach, describe, expect, it } from "vitest";
import { usePaths } from "../store/paths.js";
import { pasteState } from "./usePasteState.js";

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
});

describe("토큰 붙여넣기", () => {
    it("활성 경로를 덮는다 — 종목·날짜·선·구간, 시각은 미정", () => {
        usePaths.getState().write("B", { code: "005930", date: "2026-07-01", time: "10:00" }); // B 가 활성
        expect(pasteState("402340@2026-07-31@260715H▼")).toBe(true);
        const b = usePaths.getState().paths.find((p) => p.id === "B")!.s;
        expect(b).toEqual({ code: "402340", date: "2026-07-31", time: "", lines: [{ date: "2026-07-15", field: "H", venue: "un" }], zone: 0 });
        expect(usePaths.getState().paths.find((p) => p.id === "A")!.s.code).toBe("");
    });
    it("시각 붙은 꼴은 시각까지, 토큰이 없으면 아무것도 안 한다", () => {
        expect(pasteState("402340@2026-07-31 09:44")).toBe(true);
        expect(usePaths.getState().paths[0].s).toMatchObject({ time: "09:44", lines: [], zone: null });
        expect(pasteState("hello")).toBe(false);
    });
});
