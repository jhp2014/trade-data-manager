import { beforeEach, describe, expect, it } from "vitest";
import { usePaths } from "../store/paths.js";
import { useTokenHistory } from "../store/tokenHistory.js";
import { pasteState, reopenToken } from "./usePasteState.js";

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    useTokenHistory.setState({ entries: [] });
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
    it("글 속 토큰은 전부 토큰 기록에 쌓이고(글 속 순서), 화면은 첫 토큰", () => {
        expect(pasteState("초안 402340@2026-07-31@260715H▼ · 고침 402340@2026-07-31@260715H▲ · 틀림 402340@2026-07-31@260731H▲")).toBe(true);
        expect(useTokenHistory.getState().entries.map((e) => e.token)).toEqual(["402340@2026-07-31@260715H▼", "402340@2026-07-31@260715H▲"]);
        expect(usePaths.getState().paths[0].s).toMatchObject({ code: "402340", zone: 0 });
        expect(pasteState("hello")).toBe(false);
        expect(useTokenHistory.getState().entries).toHaveLength(2);
    });
    it("다시 열기 — 붙여넣기와 같은 쓰기, 기록 순서는 그대로", () => {
        pasteState("402340@2026-07-31@260715H▼ 009150@2026-07-30");
        usePaths.getState().write("A", { lines: [] }); // 선을 바꿔 본 뒤
        expect(reopenToken("402340@2026-07-31@260715H▼")).toBe(true);
        expect(usePaths.getState().paths[0].s).toEqual({ code: "402340", date: "2026-07-31", time: "", lines: [{ date: "2026-07-15", field: "H", venue: "un" }], zone: 0 });
        expect(reopenToken("009150@2026-07-30")).toBe(true);
        expect(usePaths.getState().paths[0].s).toMatchObject({ code: "009150", lines: [], zone: null });
        expect(useTokenHistory.getState().entries.map((e) => e.token)).toEqual(["402340@2026-07-31@260715H▼", "009150@2026-07-30"]);
    });
});
